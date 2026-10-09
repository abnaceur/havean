"""Bounded process-group supervision for allowlisted private source inspection."""
import json
import os
from pathlib import Path
import selectors
import re
import signal
import subprocess
import sys
import time
from .sources import SourceError


def inspect_source(directory: Path, name: str, kind: str, *, timeout: float = 15,
                   output_limit: int = 16 * 1024 * 1024, cancelled=None) -> dict:
    if kind not in ("pdf", "pdf_raster", "image", "native_facts_en", "native_facts_fr", "native_facts_ar") or not 0 < timeout <= 15 or not 0 < output_limit <= 16 * 1024 * 1024:
        raise SourceError("SOURCE_PROFILE_INVALID")
    try:
        root = directory.resolve(strict=True)
        if Path(name).name != name or (root / name).resolve(strict=True).parent != root:
            raise SourceError("SOURCE_PATH_INVALID")
    except OSError as error:
        raise SourceError("SOURCE_PATH_INVALID") from error
    command = [sys.executable, "-m", "property_processing.source_cli", str(root), name, kind]
    # No runner credentials are inherited by untrusted decoder subprocesses.
    environment = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                   "PYTHONPATH": str(Path(__file__).resolve().parent.parent),
                   "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUNBUFFERED": "1"}
    child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             start_new_session=True, env=environment,
                             cwd=Path(__file__).resolve().parent.parent)
    output, deadline, diagnostics = bytearray(), time.monotonic() + timeout, 0
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ, "output")
            selector.register(child.stderr, selectors.EVENT_READ, "diagnostic")
            while selector.get_map():
                if cancelled is not None and cancelled():
                    raise SourceError("SOURCE_CANCELLED")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise SourceError("SOURCE_TIME_BUDGET_EXCEEDED")
                for key, _ in selector.select(min(remaining, 0.1)):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                    elif key.data == "output":
                        if len(output) + len(chunk) > output_limit:
                            raise SourceError("SOURCE_OUTPUT_BUDGET_EXCEEDED")
                        output.extend(chunk)
                    else:
                        diagnostics += len(chunk)
                        if diagnostics > 65536:
                            raise SourceError("SOURCE_DIAGNOSTIC_BUDGET_EXCEEDED")
        try:
            child.wait(timeout=max(0.001, deadline - time.monotonic()))
        except subprocess.TimeoutExpired as error:
            raise SourceError("SOURCE_TIME_BUDGET_EXCEEDED") from error
        try:
            result = json.loads(output)
        except (ValueError, UnicodeError) as error:
            raise SourceError("SOURCE_DECODER_FAILED") from error
        if not isinstance(result, dict) or result.get("ok") is not True:
            code = result.get("code") if isinstance(result, dict) else None
            if not isinstance(code, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{1,99}", code):
                code = "SOURCE_DECODER_FAILED"
            raise SourceError(code)
        if child.returncode != 0:
            raise SourceError("SOURCE_DECODER_FAILED")
        if not isinstance(result.get("result"), dict):
            raise SourceError("SOURCE_DECODER_FAILED")
        return result["result"]
    finally:
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        child.wait()
        child.stdout.close()
        child.stderr.close()
