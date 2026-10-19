import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib
from property_processing.colmap_cli import validate_inputs


def png():
    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\0' + b'\x80'*24)*8)) + chunk(b'IEND', b'')


class ColmapInputs(unittest.TestCase):
    def fixture(self, root):
        (root / 'frames').mkdir()
        frames = []
        for n in range(3):
            body = png()
            name = 'frames/00000000-0000-4000-8000-%012d.png' % n
            (root / name).write_bytes(body)
            frames.append({'name': name, 'sha256': hashlib.sha256(body).hexdigest(), 'width': 8, 'height': 8, 'cameraGroupId': 'explicit-clip'})
        manifest = {'schemaVersion': 1, 'frames': frames, 'privacyReviewRequired': True, 'publiclyServed': False}
        (root / 'manifest.json').write_text(json.dumps(manifest))
        return manifest

    def test_canonical_inputs_exclude_unlisted_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.fixture(root)
            self.assertEqual(validate_inputs(root)[1], manifest)
            (root / 'frames' / 'excluded.png').write_bytes(png())
            with self.assertRaisesRegex(ValueError, 'Unexpected images'):
                validate_inputs(root)

    def test_tampered_hash_and_supplied_dimensions_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.fixture(root)
            manifest['frames'][0]['sha256'] = '0'*64
            (root / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                validate_inputs(root)
            manifest['frames'][0]['sha256'] = hashlib.sha256(png()).hexdigest()
            manifest['frames'][0]['width'] = 9
            (root / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'dimensions'):
                validate_inputs(root)

    def test_symlinks_missing_groups_and_public_claims_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.fixture(root)
            path = root / manifest['frames'][0]['name']
            path.unlink()
            path.symlink_to(root / manifest['frames'][1]['name'])
            with self.assertRaisesRegex(ValueError, 'inside'):
                validate_inputs(root)
            path.unlink()
            path.write_bytes(png())
            manifest['frames'][0]['cameraGroupId'] = None
            (root / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'camera group'):
                validate_inputs(root)
            manifest['frames'][0]['cameraGroupId'] = 'explicit-clip'
            manifest['publiclyServed'] = True
            (root / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'pending-review'):
                validate_inputs(root)


if __name__ == '__main__':
    unittest.main()
