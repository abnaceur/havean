from pathlib import Path
import pytest
from property_processing.source_sandbox import inspect_source
from property_processing.sources import SourceError
from test_sources import pdf


def test_real_child_inspects_native_source_and_rejects_expanded_raster_budget(tmp_path):
    (tmp_path / "document.pdf").write_bytes(pdf("Unit 00123"))
    result = inspect_source(tmp_path, "document.pdf", "pdf")
    assert "00123" in result["pages"][0]["text"]
    assert result["ocrAvailable"] is False
    (tmp_path / "oversize.pdf").write_bytes(pdf(width=14400, height=14400))
    with pytest.raises(SourceError, match="RASTER_BUDGET_EXCEEDED"):
        inspect_source(tmp_path, "oversize.pdf", "pdf")


def test_child_timeout_and_output_limits_kill_without_private_diagnostics(tmp_path):
    (tmp_path / "document.pdf").write_bytes(pdf("PRIVATE_SENTINEL"))
    for options, code in [({"timeout": 0.000001}, "SOURCE_TIME_BUDGET_EXCEEDED"),
                          ({"output_limit": 1}, "SOURCE_OUTPUT_BUDGET_EXCEEDED")]:
        with pytest.raises(SourceError, match=code) as failure:
            inspect_source(tmp_path, "document.pdf", "pdf", **options)
        assert "PRIVATE_SENTINEL" not in str(failure.value)


def test_paths_symlinks_and_unknown_profiles_are_denied(tmp_path):
    outside = tmp_path.parent / "outside.pdf"
    outside.write_bytes(pdf())
    (tmp_path / "linked.pdf").symlink_to(outside)
    for name in ("../outside.pdf", "linked.pdf"):
        with pytest.raises(SourceError, match="SOURCE_PATH_INVALID"):
            inspect_source(tmp_path, name, "pdf")
    with pytest.raises(SourceError, match="SOURCE_PROFILE_INVALID"):
        inspect_source(tmp_path, "linked.pdf", "shell")


def test_job_files_cannot_shadow_python_dependencies(tmp_path):
    (tmp_path / "document.pdf").write_bytes(pdf("Unit 00123"))
    marker = tmp_path / "executed-untrusted-module"
    (tmp_path / "pypdf.py").write_text("from pathlib import Path\nPath(" + repr(str(marker)) + ").write_text('executed')\nraise RuntimeError('UNTRUSTED_MODULE')\n")
    assert '00123' in inspect_source(tmp_path, 'document.pdf', 'pdf')['pages'][0]['text']
    assert not marker.exists()


def test_cancellation_stops_real_child_and_does_not_return_late_output(tmp_path, monkeypatch):
    import subprocess
    child_processes = []
    original = subprocess.Popen
    def launch(*args, **kwargs):
        child = original(*args, **kwargs)
        child_processes.append(child)
        return child
    monkeypatch.setattr(subprocess, 'Popen', launch)
    (tmp_path / 'document.pdf').write_bytes(pdf('PRIVATE_CANCELLED'))
    with pytest.raises(SourceError, match='SOURCE_CANCELLED'):
        inspect_source(tmp_path, 'document.pdf', 'pdf_raster', cancelled=lambda: True)
    assert len(child_processes) == 1
    assert child_processes[0].poll() is not None
