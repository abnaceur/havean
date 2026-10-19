"""Private CPU runner readiness. Execution protocol is implemented separately."""
import json
import os
from pathlib import Path
import threading
import time
from functools import lru_cache
from .executions import ExecutionAuthority, ExecutionStore, ExecutionError, digest, UUID_RE, SHA_RE, PROFILES
from http.server import BaseHTTPRequestHandler, HTTPServer
from uuid import uuid4
from .adapters import configure_adapter
from .decoder_isolation import landlock_abi, READ_ROOTS
from .ocr_release import production_ocr_ready


@lru_cache(maxsize=1)
def camera_runtime_ready():
    if 'private-colmap-cpu-investigation-v1' not in PROFILES:
        return False
    from .colmap_runtime import verify_runtime
    profile = json.loads(Path('/opt/colmap/runtime-profile.json').read_text())
    verify_runtime('/opt/colmap', profile, installed=True)
    return True


def capabilities():
    adapter = configure_adapter(os.environ)
    abi = landlock_abi()  # Fail closed on a host missing the required unprivileged isolation.
    if os.environ.get('PROCESSING_RUNNER_KIND') == 'gpu':
        enabled = os.environ.get('PROCESSING_DEPLOYMENT') in ('test', 'development') and os.environ.get('PROCESSING_ENABLE_GSPLAT_INVESTIGATION') == 'true'
        return {'sceneTrainingEnabled': enabled, 'gpuValidated': False, 'reconstructionAvailable': False, 'landlockAbi': abi, 'profile': 'gsplat-1.5.3-cu126-adaptive-investigation-v2'}
    from .pdf_raster import verified_pdfium
    verified_pdfium()  # Fail closed for a substituted/script-enabled native decoder.
    media_enabled = os.environ.get('PROCESSING_ENABLE_MEDIA_PROBE') == 'true'
    if media_enabled:
        from .media_probe import verified_media_runtime
        verified_media_runtime()
    return {"mediaProbeAvailable": media_enabled, "mediaSourceMaxBytes": 10*1024*1024 if media_enabled else None, "adapterVersion": adapter.version, "decoderIsolationProfile": "linux-landlock-seccomp-decoder-v1", "landlockAbi": abi, "nativePdfAvailable": True, "pdfRasterAvailable": True,
            "imageOrientationAvailable": True, "ocrAvailable": production_ocr_ready(),
            "cameraSolveAvailable": camera_runtime_ready(), "reconstructionAvailable": False}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "HavenProcessing"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *_args):
        # Never record caller URLs, document names, source text or credentials.
        pass

    def send_json(self, status, body):
        encoded = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(encoded)
        self.close_connection = True

    def execution_authority(self, execution_id, action):
        if not self.server.execution_store:
            raise ExecutionError("EXECUTION_UNAVAILABLE", 503)
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise ExecutionError("EXECUTION_UNAUTHORIZED", 401)
        return self.server.execution_authority.verify(header[7:], execution_id, action)

    def execution_error(self, failure):
        self.send_json(failure.status, {"error": {"code": failure.code, "recoverable": failure.status in (429, 503), "requestId": str(uuid4())}})

    def do_GET(self):
        parts = self.path.split('/')
        if len(parts) == 5 and parts[1] == 'executions' and parts[3] in ('previews', 'training-archives', 'training-outputs') and UUID_RE.fullmatch(parts[2]) and SHA_RE.fullmatch(parts[4]):
            try:
                request_hash = self.execution_authority(parts[2], 'preview')
                training = parts[3] == 'training-archives'
                method = self.server.execution_store.training_archive if training else self.server.execution_store.preview
                if parts[3] == 'training-outputs':
                    body, mime = self.server.execution_store.training_output(parts[2], request_hash, parts[4])
                else:
                    body = method(parts[2], request_hash, parts[4])
                    mime = 'application/x-tar' if training else 'image/png'
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Connection', 'close')
                self.end_headers()
                self.wfile.write(body)
                self.close_connection = True
            except ExecutionError as failure:
                self.execution_error(failure)
            return
        if self.path == "/health/live":
            self.send_json(200, {"data": {"status": "up"}})
        elif self.path == "/health/ready":
            self.send_json(200, {"data": {"status": "up", "capabilities": {**capabilities(), "executionProtocolAvailable": self.server.execution_store is not None, "executionProfileIds": sorted(PROFILES) if self.server.execution_store else []}}})
        elif self.path.startswith("/executions/") and UUID_RE.fullmatch(self.path[12:]):
            try:
                execution_id = self.path[12:]
                request_hash = self.execution_authority(execution_id, "read")
                self.send_json(200, {"data": self.server.execution_store.get(execution_id, request_hash)})
            except ExecutionError as failure:
                self.execution_error(failure)
        else:
            self.send_json(404, {"error": {"code": "NOT_FOUND", "requestId": str(uuid4())}})

    def do_POST(self):
        try:
            if self.path.startswith('/executions/') and self.path.endswith('/purge') and UUID_RE.fullmatch(self.path[12:-6]):
                execution_id = self.path[12:-6]
                request_hash = self.execution_authority(execution_id, 'purge')
                length = int(self.headers.get('Content-Length', '0'))
                if length < 0 or length > 16384:
                    raise ExecutionError('EXECUTION_INVALID', 413)
                request = json.loads(self.rfile.read(length)) if length else None
                if request is not None and not isinstance(request, dict):
                    raise ExecutionError('EXECUTION_INVALID')
                self.send_json(200, {'data': self.server.execution_store.purge(execution_id, request_hash, request or None)})
                return
            if not self.server.execution_store:
                raise ExecutionError("EXECUTION_UNAVAILABLE", 503)
            parts = self.path.split('/')
            if len(parts) == 5 and parts[1] == 'executions' and parts[3] == 'sources' and UUID_RE.fullmatch(parts[2]) and UUID_RE.fullmatch(parts[4]):
                request_hash = self.execution_authority(parts[2], 'source')
                lengths = self.headers.get_all('Content-Length', [])
                if self.headers.get('Transfer-Encoding') or len(lengths) != 1 or not lengths[0].isdigit():
                    raise ExecutionError('EXECUTION_INVALID', 400)
                length = int(lengths[0])
                if not 0 < length <= 384*1024*1024:
                    raise ExecutionError('EXECUTION_REQUEST_TOO_LARGE', 413)
                result = self.server.execution_store.receive_source(parts[2], request_hash, parts[4], length,
                                                                   self.headers.get('Content-Type', ''), self.rfile)
                self.send_json(202, {'data': result})
                return
            if self.path.startswith("/executions/") and self.path.endswith("/cancel") and UUID_RE.fullmatch(self.path[12:-7]):
                execution_id = self.path[12:-7]
                request_hash = self.execution_authority(execution_id, "cancel")
                length = int(self.headers.get('Content-Length', '0'))
                if self.headers.get('Transfer-Encoding') or not 0 <= length <= 16384:
                    raise ExecutionError('EXECUTION_INVALID', 413)
                request = json.loads(self.rfile.read(length)) if length else None
                if request is not None and not isinstance(request, dict):
                    raise ExecutionError('EXECUTION_INVALID')
                self.send_json(200, {"data": self.server.execution_store.cancel(execution_id, request_hash, request or None)})
                return
            if self.path != "/executions":
                raise ExecutionError("NOT_FOUND", 404)
            # Require bounded framing; reject ambiguous transfer/content-length headers.
            lengths = self.headers.get_all("Content-Length", [])
            if self.headers.get("Transfer-Encoding") or len(lengths) != 1 or not lengths[0].isdigit():
                raise ExecutionError("EXECUTION_INVALID", 400)
            size = int(lengths[0])
            if size > 65536:
                raise ExecutionError("EXECUTION_REQUEST_TOO_LARGE", 413)
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                raise ExecutionError("EXECUTION_INVALID", 415)
            def strict_pairs(pairs):
                result = {}
                for key, value in pairs:
                    if key in result:
                        raise ValueError("Duplicate JSON key")
                    result[key] = value
                return result
            try:
                body = json.loads(self.rfile.read(size), object_pairs_hook=strict_pairs,
                                  parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
                execution_id = body.get("executionId") if isinstance(body, dict) else None
                if not isinstance(execution_id, str) or not UUID_RE.fullmatch(execution_id):
                    raise ValueError()
                request_hash = self.execution_authority(execution_id, "submit")
                if request_hash != digest(body):
                    raise ExecutionError("EXECUTION_UNAUTHORIZED", 401)
                self.server.execution_store.submit(body, request_hash)
            except (ValueError, TypeError) as failure:
                if isinstance(failure, ExecutionError):
                    raise
                raise ExecutionError("EXECUTION_INVALID", 422) from None
            self.send_json(202, {"data": self.server.execution_store.get(execution_id, request_hash)})
        except ExecutionError as failure:
            self.execution_error(failure)
        except (OSError, TimeoutError):
            self.execution_error(ExecutionError("EXECUTION_UNAVAILABLE", 503))


def make_server(host="0.0.0.0", port=8020, *, execution_store=None, execution_authority=None):
    capabilities()  # Reject forbidden simulator configuration before binding.
    server = HTTPServer((host, port), Handler)
    if (execution_store is None) != (execution_authority is None):
        server.server_close()
        raise ValueError("Execution store and authority must be configured together")
    server.execution_store = execution_store
    server.execution_authority = execution_authority
    server.timeout = 5
    return server


if __name__ == "__main__":
    key_path, root = os.environ.get("PROCESSING_SIGNING_KEY_FILE"), os.environ.get("PROCESSING_EXECUTION_ROOT")
    if bool(key_path) != bool(root):
        raise ValueError("Execution configuration incomplete")
    if key_path:
        signing_path = Path(key_path).resolve(strict=True)
        forbidden = [Path(value).resolve() for value in READ_ROOTS] + [Path(__file__).resolve().parent.parent, Path(root).resolve(strict=True)]
        if any(signing_path == path or path in signing_path.parents for path in forbidden):
            raise ValueError("Runner key must be outside decoder-readable roots")
    store = ExecutionStore(Path(root)) if root else None
    authority = ExecutionAuthority(Path(key_path).read_bytes()) if key_path else None
    stop = threading.Event()
    def execute():
        cleanup_due = 0
        while not stop.is_set():
            if time.monotonic() >= cleanup_due:
                try:
                    store.cleanup_expired()
                except (OSError, ExecutionError):
                    # Retain scratch and retry, without logging paths or sources.
                    pass
                cleanup_due = time.monotonic()+60
            if not store.perform_one():
                stop.wait(0.1)
    with make_server(execution_store=store, execution_authority=authority) as server:
        worker = threading.Thread(target=execute, daemon=True) if store else None
        if worker:
            worker.start()
        try:
            server.serve_forever(poll_interval=0.5)
        finally:
            stop.set()
            if worker:
                worker.join(timeout=16)
