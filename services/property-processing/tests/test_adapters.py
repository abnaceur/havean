from uuid import uuid4
import pytest
from property_processing.adapters import (
    AdapterConfigurationError, DevelopmentSimulator, StageRequest, configure_adapter,
)


def request():
    return StageRequest(uuid4(), "document_ocr", "generic-v1", 1, (uuid4(),))


@pytest.mark.parametrize("deployment", ["production", "staging", "test"])
def test_non_development_rejects_simulator_even_with_explicit_flag(deployment):
    with pytest.raises(AdapterConfigurationError):
        configure_adapter({"PROCESSING_DEPLOYMENT": deployment, "PROCESSING_ADAPTER": "simulator",
                           "PROCESSING_ENABLE_SIMULATOR": "true"})
    with pytest.raises(AdapterConfigurationError):
        DevelopmentSimulator(deployment=deployment, explicitly_enabled=True)


def test_development_requires_explicit_flag_and_cannot_make_ready_artifacts():
    with pytest.raises(AdapterConfigurationError):
        configure_adapter({"PROCESSING_DEPLOYMENT": "development", "PROCESSING_ADAPTER": "simulator"})
    result = configure_adapter({"PROCESSING_DEPLOYMENT": "development", "PROCESSING_ADAPTER": "simulator",
                                "PROCESSING_ENABLE_SIMULATOR": "true"}).execute(request())
    assert result.simulated and not result.eligible_for_validation
    assert result.state == "development_diagnostic" and result.artifact_ids == ()


def test_missing_real_adapter_reports_unavailable_instead_of_success():
    result = configure_adapter({}).execute(request())
    assert not result.eligible_for_validation and result.state == "unavailable"
    assert not result.artifact_ids and not result.simulated
    with pytest.raises(AdapterConfigurationError):
        configure_adapter({"PROCESSING_ADAPTER": "paddleocr"})
    with pytest.raises(AdapterConfigurationError):
        configure_adapter({"PROCESSING_ENABLE_SIMULATOR": "true"})


def test_commands_and_arbitrary_asset_paths_are_rejected():
    with pytest.raises(AdapterConfigurationError):
        StageRequest(uuid4(), "shell", "generic-v1", 1, ())
    with pytest.raises(AdapterConfigurationError):
        StageRequest(uuid4(), "document_ocr", "generic-v1", 1, ("/private/owner.pdf",))
