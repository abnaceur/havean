"""Private durable CPU executions. PostgreSQL remains the workflow/publication authority."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import threading
import time
from datetime import datetime, timezone
from contextlib import contextmanager
from uuid import UUID
from .source_sandbox import inspect_source
from .sources import SourceError

PROFILES = {'pdfium-150dpi-v1': ('document_rasterize', 'application/pdf', 'pdf_raster', 20*1024*1024),
            'upright-image-v1': ('document_rasterize', ('image/jpeg', 'image/png'), 'image', 10*1024*1024)}
for locale in ('en', 'fr', 'ar'):
    PROFILES['generic-native-facts-'+locale+'-v1'] = ('fact_extract', 'application/pdf', 'native_facts_'+locale, 20*1024*1024)
UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
SHA_RE = re.compile(r'^[a-f0-9]{64}$')


class ExecutionError(ValueError):
    def __init__(self, code, status=422):
        self.code, self.status = code, status
        super().__init__(code)


def canonical(body):
    return json.dumps(body, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def digest(body):
    return hashlib.sha256(canonical(body)).hexdigest()


def validate_request(body, now=None):
    expected = {'schemaVersion', 'executionId', 'organizationId', 'runId', 'stageId', 'stageType',
                'profileId', 'inputRevision', 'inputFingerprint', 'fencingToken', 'artifacts', 'deadline', 'budget'}
    if not isinstance(body, dict) or set(body) != expected or type(body['schemaVersion']) is not int or body['schemaVersion'] != 1:
        raise ExecutionError('EXECUTION_INVALID')
    for key in ('executionId', 'organizationId', 'runId', 'stageId'):
        if not isinstance(body[key], str) or not UUID_RE.fullmatch(body[key]):
            raise ExecutionError('EXECUTION_INVALID')
        UUID(body[key])
    if type(body['inputRevision']) is not int or body['inputRevision'] < 1:
        raise ExecutionError('EXECUTION_INVALID')
    if not isinstance(body['inputFingerprint'], str) or not SHA_RE.fullmatch(body['inputFingerprint']):
        raise ExecutionError('EXECUTION_INVALID')
    if not isinstance(body['fencingToken'], str) or not re.fullmatch(r'[1-9]\d{0,18}', body['fencingToken']):
        raise ExecutionError('EXECUTION_INVALID')
    profile = PROFILES.get(body['profileId']) if isinstance(body['profileId'], str) else None
    if not profile or body['stageType'] != profile[0]:
        raise ExecutionError('EXECUTION_PROFILE_UNAVAILABLE')
    inputs = body['artifacts']
    if not isinstance(inputs, list) or len(inputs) != 1:
        raise ExecutionError('EXECUTION_INVALID')
    asset = inputs[0]
    if not isinstance(asset, dict) or set(asset) != {'id', 'checksum', 'byteSize', 'detectedMime'}:
        raise ExecutionError('EXECUTION_INVALID')
    if not isinstance(asset['id'], str) or not UUID_RE.fullmatch(asset['id']) or not isinstance(asset['checksum'], str) or not SHA_RE.fullmatch(asset['checksum']):
        raise ExecutionError('EXECUTION_INVALID')
    if not isinstance(asset['byteSize'], str) or not re.fullmatch(r'[1-9]\d{0,12}', asset['byteSize']) or int(asset['byteSize']) > profile[3]:
        raise ExecutionError('EXECUTION_SOURCE_BUDGET_EXCEEDED')
    mimes = profile[1] if isinstance(profile[1], tuple) else (profile[1],)
    if asset['detectedMime'] not in mimes:
        raise ExecutionError('EXECUTION_PROFILE_INVALID')
    budget = body['budget']
    if not isinstance(budget, dict) or set(budget) != {'maxSeconds', 'maxScratchBytes'} or type(budget['maxSeconds']) is not int or not 0 < budget['maxSeconds'] <= 15:
        raise ExecutionError('EXECUTION_BUDGET_INVALID')
    if not isinstance(budget['maxScratchBytes'], str) or not re.fullmatch(r'[1-9]\d{0,12}', budget['maxScratchBytes']) or not 0 < int(budget['maxScratchBytes']) <= 64*1024*1024:
        raise ExecutionError('EXECUTION_BUDGET_INVALID')
    try:
        deadline = datetime.fromisoformat(body['deadline'].replace('Z', '+00:00'))
        if deadline.tzinfo != timezone.utc:
            raise ValueError()
        expires = deadline.timestamp()
    except (ValueError, TypeError, AttributeError):
        raise ExecutionError('EXECUTION_DEADLINE_INVALID') from None
    now = time.time() if now is None else now
    if expires <= now or expires > now + 86400 or expires < now + budget['maxSeconds']:
        raise ExecutionError('EXECUTION_DEADLINE_INVALID')
    return body


class ExecutionAuthority:
    """HMAC grants bind one execution/request and explicit operations, for at most five minutes."""
    def __init__(self, secret):
        if not isinstance(secret, bytes) or len(secret) < 32:
            raise ValueError('Runner requires a strong private signing key')
        self.secret = secret

    def verify(self, token, execution_id, action):
        try:
            if not isinstance(token, str) or len(token) > 4096:
                raise ValueError()
            encoded, signature = token.split('.')
            mac = hmac.new(self.secret, encoded.encode('ascii'), hashlib.sha256).digest()
            supplied = base64.urlsafe_b64decode(signature + '=' * (-len(signature) % 4))
            if not hmac.compare_digest(mac, supplied):
                raise ValueError()
            claims = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
            if set(claims) != {'aud', 'executionId', 'requestDigest', 'expiresAt', 'actions'} or claims['aud'] != 'haven-processing-v1' or claims['executionId'] != execution_id:
                raise ValueError()
            now = time.time()
            if type(claims['expiresAt']) not in (int, float) or not now < claims['expiresAt'] <= now + 300:
                raise ValueError()
            if not isinstance(claims['requestDigest'], str) or not SHA_RE.fullmatch(claims['requestDigest']):
                raise ValueError()
            if not isinstance(claims['actions'], list) or not claims['actions'] or len(set(claims['actions'])) != len(claims['actions']) or not set(claims['actions']) <= {'submit', 'read', 'cancel', 'source', 'preview'} or action not in claims['actions']:
                raise ValueError()
            return claims['requestDigest']
        except (ValueError, TypeError, KeyError, UnicodeError, AttributeError):
            raise ExecutionError('EXECUTION_UNAUTHORIZED', 401) from None


class ExecutionStore:
    def __init__(self, root: Path):
        self.root = root.resolve(strict=True)
        self.lock = threading.RLock()
        self.active = set()
        self.db_path = self.root / 'executions.sqlite3'
        if self.db_path.is_symlink():
            raise ValueError('Invalid private execution store')
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, request TEXT NOT NULL, state TEXT NOT NULL, result TEXT, error TEXT, created REAL NOT NULL, updated REAL NOT NULL)')
            if 'scratch_cleaned_at' not in {column[1] for column in db.execute('PRAGMA table_info(executions)')}:
                db.execute('ALTER TABLE executions ADD COLUMN scratch_cleaned_at REAL')
            # Reconcile interrupted subprocesses explicitly; never silently start duplicate work.
            db.execute("UPDATE executions SET state='failed_retryable', error='RUNNER_INTERRUPTED', updated=? WHERE state='running'", (time.time(),))
            for row in db.execute("SELECT id,request FROM executions WHERE state='awaiting_source'").fetchall():
                request = json.loads(row['request'])
                directory = self.root / row['id']
                if directory.is_dir() and not directory.is_symlink():
                    # Interrupted bounded transfer is retried using the same scoped receipt.
                    (directory / 'source.partial').unlink(missing_ok=True)
                    asset = request['artifacts'][0]
                    source = directory / asset['id']
                    if source.is_file() and not source.is_symlink():
                        with source.open('rb') as handle:
                            size = int(asset['byteSize'])
                            valid = os.fstat(handle.fileno()).st_size == size and hashlib.sha256(handle.read(size+1)).hexdigest() == asset['checksum']
                        if valid:
                            db.execute("UPDATE executions SET state='pending',updated=? WHERE id=?", (time.time(), row['id']))
        os.chmod(self.db_path, 0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA synchronous=FULL')
        try:
            with db:
                yield db
        finally:
            db.close()

    def submit(self, request, request_hash):
        with self.lock, self.connect() as db:
            existing = db.execute('SELECT request_hash FROM executions WHERE id=?', (request['executionId'],)).fetchone()
            if existing:
                if existing['request_hash'] != request_hash:
                    raise ExecutionError('EXECUTION_ID_CONFLICT', 409)
                return False
            validate_request(request)
            if db.execute("SELECT count(*) FROM executions WHERE state IN ('awaiting_source','pending','running')").fetchone()[0] >= 32:
                raise ExecutionError('EXECUTION_CAPACITY_EXCEEDED', 429)
            now = time.time()
            db.execute('INSERT INTO executions(id,request_hash,request,state,result,error,created,updated) VALUES (?,?,?,?,?,?,?,?)',
                       (request['executionId'], request_hash, canonical(request).decode(), 'pending' if (self.root / request['executionId'] / request['artifacts'][0]['id']).is_file() else 'awaiting_source', None, None, now, now))
            return True

    def cleanup_expired(self):
        """Keep durable receipts; reclaim only stopped, expired scratch after a day.

        Interrupted/ambiguous processes remain quarantined. No caller supplies a
        directory, and active decoders or source-transfer windows are retained.
        """
        if not shutil.rmtree.avoids_symlink_attacks:
            raise ExecutionError('EXECUTION_CLEANUP_UNAVAILABLE', 503)
        now, removed = time.time(), 0
        with self.lock, self.connect() as db:
            for row in db.execute("SELECT id,request FROM executions WHERE state='awaiting_source' LIMIT 32").fetchall():
                deadline = datetime.fromisoformat(json.loads(row['request'])['deadline'].replace('Z', '+00:00')).timestamp()
                if deadline <= now and row['id'] not in self.active:
                    db.execute("UPDATE executions SET state='failed_terminal',error='EXECUTION_DEADLINE_EXPIRED',updated=? WHERE id=? AND state='awaiting_source'", (now, row['id']))
            rows = db.execute("SELECT id,request FROM executions WHERE state IN('succeeded','failed_terminal','cancelled') AND scratch_cleaned_at IS NULL AND updated<? ORDER BY updated LIMIT 32", (now-86400,)).fetchall()
            for row in rows:
                if row['id'] in self.active or not UUID_RE.fullmatch(row['id']):
                    continue
                deadline = datetime.fromisoformat(json.loads(row['request'])['deadline'].replace('Z', '+00:00')).timestamp()
                if deadline > now-86400:
                    continue
                directory = self.root / row['id']
                if directory.is_symlink():
                    continue
                if directory.exists():
                    if not directory.is_dir() or directory.resolve(strict=True).parent != self.root:
                        continue
                    shutil.rmtree(directory)
                db.execute('UPDATE executions SET scratch_cleaned_at=? WHERE id=?', (now, row['id']))
                removed += 1
        return removed

    def get(self, execution_id, request_hash):
        with self.connect() as db:
            row = db.execute('SELECT * FROM executions WHERE id=?', (execution_id,)).fetchone()
        if not row or row['request_hash'] != request_hash:
            raise ExecutionError('EXECUTION_NOT_FOUND', 404)
        with self.lock:
            stopped = execution_id not in self.active
        return {'executionId': execution_id, 'state': row['state'], 'processStopped': stopped,
                'result': json.loads(row['result']) if row['result'] else None, 'errorCode': row['error']}

    def receive_source(self, execution_id, request_hash, asset_id, length, mime, stream):
        with self.connect() as db:
            row = db.execute('SELECT * FROM executions WHERE id=? AND request_hash=?', (execution_id, request_hash)).fetchone()
        if not row:
            raise ExecutionError('EXECUTION_NOT_FOUND', 404)
        request = json.loads(row['request'])
        asset = request['artifacts'][0]
        if asset_id != asset['id'] or length != int(asset['byteSize']) or mime != asset['detectedMime']:
            raise ExecutionError('EXECUTION_SOURCE_MISMATCH')
        if row['state'] != 'awaiting_source':
            raise ExecutionError('EXECUTION_SOURCE_STATE_CONFLICT', 409)
        validate_request(request)
        directory = self.root / execution_id
        directory.mkdir(mode=0o700, exist_ok=True)
        if directory.is_symlink() or directory.resolve(strict=True).parent != self.root:
            raise ExecutionError('EXECUTION_SOURCE_MISMATCH')
        temporary = directory / 'source.partial'
        checksum, remaining, deadline = hashlib.sha256(), length, time.monotonic()+15
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'wb') as output:
                while remaining:
                    if time.monotonic() > deadline:
                        raise ExecutionError('EXECUTION_SOURCE_TIMEOUT', 408)
                    chunk = stream.read(min(remaining, 65536))
                    if not chunk:
                        raise ExecutionError('EXECUTION_SOURCE_INCOMPLETE')
                    remaining -= len(chunk)
                    checksum.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if checksum.hexdigest() != asset['checksum']:
                raise ExecutionError('EXECUTION_SOURCE_MISMATCH')
            with self.lock, self.connect() as db:
                current = db.execute('SELECT state FROM executions WHERE id=?', (execution_id,)).fetchone()['state']
                if current != 'awaiting_source':
                    raise ExecutionError('EXECUTION_SOURCE_STATE_CONFLICT', 409)
                os.replace(temporary, directory / asset_id)
                # Synchronize the directory entry before making execution runnable.
                fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
                db.execute("UPDATE executions SET state='pending',updated=? WHERE id=? AND state='awaiting_source'", (time.time(), execution_id))
        finally:
            temporary.unlink(missing_ok=True)
        return self.get(execution_id, request_hash)

    def preview(self, execution_id, request_hash, checksum):
        """Only committed, checksum-listed decoder outputs; never accept object paths."""
        if not SHA_RE.fullmatch(checksum):
            raise ExecutionError('EXECUTION_PREVIEW_NOT_FOUND', 404)
        with self.lock:
            receipt = self.get(execution_id, request_hash)
            if receipt['state'] != 'succeeded':
                raise ExecutionError('EXECUTION_PREVIEW_NOT_FOUND', 404)
            result = receipt['result']
            outputs = result.get('pages', []) if isinstance(result, dict) else []
            if isinstance(result, dict) and isinstance(result.get('image'), dict):
                outputs = [result['image']]
            selected = next((page for page in outputs if isinstance(page, dict) and page.get('sha256') == checksum), None) if isinstance(outputs, list) else None
            filename = selected.get('previewFilename', '') if selected else ''
            if not re.fullmatch(r'page-\d{3}-'+checksum+r'\.png', filename):
                raise ExecutionError('EXECUTION_PREVIEW_NOT_FOUND', 404)
            directory = self.root / execution_id
            try:
                if directory.is_symlink() or directory.resolve(strict=True).parent != self.root:
                    raise ExecutionError('EXECUTION_PREVIEW_INVALID', 503)
                fd = os.open(directory / filename, os.O_RDONLY | os.O_NOFOLLOW)
                with os.fdopen(fd, 'rb') as handle:
                    info = os.fstat(handle.fileno())
                    if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= 32*1024*1024:
                        raise ExecutionError('EXECUTION_PREVIEW_INVALID', 503)
                    body = handle.read(info.st_size+1)
                if len(body) != info.st_size or hashlib.sha256(body).hexdigest() != checksum or not body.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise ExecutionError('EXECUTION_PREVIEW_INVALID', 503)
            except OSError:
                raise ExecutionError('EXECUTION_PREVIEW_INVALID', 503) from None
            return body

    def cancel(self, execution_id, request_hash):
        with self.lock, self.connect() as db:
            row = db.execute('SELECT * FROM executions WHERE id=?', (execution_id,)).fetchone()
            if not row or row['request_hash'] != request_hash:
                raise ExecutionError('EXECUTION_NOT_FOUND', 404)
            if row['state'] in ('awaiting_source', 'pending', 'running'):
                db.execute("UPDATE executions SET state='cancelled', result=NULL, error=NULL, updated=? WHERE id=?", (time.time(), execution_id))
        state = self.get(execution_id, request_hash)
        if state['state'] == 'cancelled':
            self.clean_previews(execution_id)
        return state

    def clean_previews(self, execution_id):
        directory = self.root / execution_id
        if not directory.is_dir() or directory.is_symlink():
            return
        for preview in directory.iterdir():
            if re.fullmatch(r'page-\d{3}-[a-f0-9]{64}\.png', preview.name):
                preview.unlink(missing_ok=True)

    def perform_one(self):
        with self.lock, self.connect() as db:
            row = db.execute("SELECT * FROM executions WHERE state='pending' ORDER BY created LIMIT 1").fetchone()
            if not row:
                return False
            db.execute("UPDATE executions SET state='running', updated=? WHERE id=?", (time.time(), row['id']))
            self.active.add(row['id'])
        try:
            request = json.loads(row['request'])
            result, error = None, None
            try:
                validate_request(request)
                # Files are provisioned by a trusted job-scoped artifact port, never by HTTP filenames.
                directory = self.root / row['id']
                if directory.is_symlink() or directory.resolve(strict=True).parent != self.root:
                    raise SourceError('SOURCE_PATH_INVALID')
                asset = request['artifacts'][0]
                path = directory / asset['id']
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                with os.fdopen(fd, 'rb') as handle:
                    size = int(asset['byteSize'])
                    if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode) or os.fstat(handle.fileno()).st_size != size:
                        raise SourceError('SOURCE_OBJECT_MISMATCH')
                    if hashlib.sha256(handle.read(size+1)).hexdigest() != asset['checksum']:
                        raise SourceError('SOURCE_OBJECT_MISMATCH')
                if int(request['budget']['maxScratchBytes']) < size + 32*1024*1024:
                    raise SourceError('SOURCE_SCRATCH_BUDGET_EXCEEDED')
                result = inspect_source(directory, asset['id'], PROFILES[request['profileId']][2], timeout=request['budget']['maxSeconds'],
                                        cancelled=lambda: self.get(row['id'], row['request_hash'])['state'] == 'cancelled')
                if request["profileId"] == "upright-image-v1" and result.get("image", {}).get("detectedMime") != asset["detectedMime"]:
                    raise SourceError("SOURCE_MIME_MISMATCH")
            except SourceError as failure:
                error = str(failure)
            except ExecutionError as failure:
                error = failure.code
            except Exception:
                error = 'EXECUTION_FAILED'
            if error:
                result = None
                self.clean_previews(row["id"])
            with self.lock, self.connect() as db:
                # Cancellation wins against late output. API must also check its current lease/revision/grants.
                db.execute("UPDATE executions SET state=?,result=?,error=?,updated=? WHERE id=? AND state='running'",
                           ('failed_terminal' if error else 'succeeded', canonical(result).decode() if result else None, error, time.time(), row['id']))
            if self.get(row['id'], row['request_hash'])['state'] == 'cancelled':
                self.clean_previews(row['id'])
            return True
        finally:
            with self.lock:
                self.active.discard(row['id'])
