import hashlib
import pytest
import exclude_ocr_gui


def fixture(root, monkeypatch):
    # Authored bytes test the owned-build guard, not OpenCV functionality.
    pins = {}
    for name in ['first.so', 'second.so']:
        body = ('authored native exclusion fixture ' + name).encode()
        (root / name).write_bytes(body)
        pins[name] = hashlib.sha256(body).hexdigest()
    monkeypatch.setattr(exclude_ocr_gui, 'EXCLUDED_FILES', pins)


def test_exact_owned_build_set_is_removed_without_enabling_production(tmp_path, monkeypatch):
    fixture(tmp_path, monkeypatch)
    record = exclude_ocr_gui.exclude_gui(tmp_path)
    assert record['productionEnabled'] is False
    assert all(not (tmp_path / name).exists() for name in record['excludedFiles'])


def test_entire_set_is_verified_before_removal_and_symlinks_are_refused(tmp_path, monkeypatch):
    fixture(tmp_path, monkeypatch)
    (tmp_path / 'second.so').write_bytes(b'changed')
    with pytest.raises(ValueError, match='checksum'):
        exclude_ocr_gui.exclude_gui(tmp_path)
    assert (tmp_path / 'first.so').exists()
    fixture(tmp_path, monkeypatch)
    (tmp_path / 'second.so').unlink()
    (tmp_path / 'second.so').symlink_to(tmp_path / 'first.so')
    with pytest.raises(ValueError, match='checksum'):
        exclude_ocr_gui.exclude_gui(tmp_path)
    assert (tmp_path / 'first.so').exists()
