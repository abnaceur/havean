import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from property_processing.colmap_runtime import verify_runtime


class ColmapRuntimeTests(unittest.TestCase):
    def fixture(self, root):
        files = []
        for name, body in [('bin/colmap', b'Authored checksum fixture; not an executable'),
                           ('lib/libexample.so.1', b'Authored native bytes'),
                           ('notices/example.copyright', b'Authored notice fixture')]:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
            files.append({'name': name, 'bytes': str(len(body)), 'sha256': hashlib.sha256(body).hexdigest(), 'package': None})
        profile = {'id': 'colmap-3.10-source-cpu-runtime-v1', 'productionEnabled': False,
                   'gpuAvailable': False, 'files': files}
        (root / 'runtime-profile.json').write_text(json.dumps(profile))
        return profile

    def test_exact_seal_and_modified_dependency_refusal(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            profile = self.fixture(root)
            self.assertEqual(verify_runtime(root, profile), profile)
            (root / 'lib/libexample.so.1').write_bytes(b'Changed native bytes')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                verify_runtime(root, profile)

    def test_missing_extra_and_symlink_material_refusal(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            profile = self.fixture(root)
            (root / 'source').mkdir()
            (root / 'source/restricted.cpp').write_text('Authored unexpected file')
            with self.assertRaisesRegex(ValueError, 'Unexpected'):
                verify_runtime(root, profile)
            (root / 'source/restricted.cpp').unlink()
            (root / 'source').rmdir()
            native = root / 'lib/libexample.so.1'
            native.unlink()
            with self.assertRaisesRegex(ValueError, 'checksum'):
                verify_runtime(root, profile)
            native.symlink_to(root / 'bin/colmap')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                verify_runtime(root, profile)

    def test_changed_profile_production_and_duplicate_entries_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            profile = self.fixture(root)
            changed = {**profile, 'productionEnabled': True}
            (root / 'runtime-profile.json').write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, 'profile'):
                verify_runtime(root, profile)
            with self.assertRaisesRegex(ValueError, 'profile'):
                verify_runtime(root, changed)
            duplicate = {**profile, 'files': profile['files'] * 2}
            (root / 'runtime-profile.json').write_text(json.dumps(duplicate))
            with self.assertRaisesRegex(ValueError, 'Unique'):
                verify_runtime(root, duplicate)
