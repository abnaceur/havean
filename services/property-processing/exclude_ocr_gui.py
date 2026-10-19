"""Remove exactly two audited GUI files from a separate investigation build."""
import hashlib
import json
from pathlib import Path

EXCLUDED_FILES = {
    'cv2/qt/plugins/platforms/libqxcb.so': 'f2d4fa61236c2977614b5e962d6e3ad042a8ade21b9a66e4436b9e4fd8ff3728',
    'opencv_contrib_python.libs/libQt5XcbQpa-3bf8a55a.so.5.15.13': '2315f1c3c4c5ff751f9db04e8fdceaa4bcc80a2a9ceda468f36ee95a2d98eade',
}


def exclude_gui(root):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Regular owned package root required')
    # Validate the entire fixed set before changing this owned build stage.
    for name, expected in EXCLUDED_FILES.items():
        path = root / name
        if any(parent.is_symlink() for parent in path.parents if parent.is_relative_to(root)) or path.is_symlink() or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('Audited GUI file checksum mismatch')
    for name in EXCLUDED_FILES:
        (root / name).unlink()
    return {'schemaVersion': 1, 'excludedFiles': EXCLUDED_FILES,
            'reason': 'Qt platform GUI is unsupported by this offline OCR investigation; other Qt libraries remain.',
            'productionEnabled': False}


if __name__ == '__main__':
    result = exclude_gui('/usr/local/lib/python3.12/site-packages')
    Path('/tmp/ocr-gui-exclusions.json').write_text(json.dumps(result, indent=2))
