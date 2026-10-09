"""Replaceable processing ports; unavailable tools cannot report ready output."""
from dataclasses import dataclass
from typing import Literal, Mapping, Protocol
from uuid import UUID

Stage = Literal["document_ocr", "fact_extract", "plan_trace", "camera_solve", "splat_train", "scene_export"]
STAGES = frozenset(("document_ocr", "fact_extract", "plan_trace", "camera_solve", "splat_train", "scene_export"))


class AdapterConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class StageRequest:
    execution_id: UUID
    stage: Stage
    profile_id: str
    input_revision: int
    # References are opaque scoped IDs, never filenames, URLs or shell commands.
    artifact_ids: tuple[UUID, ...]

    def __post_init__(self):
        if self.stage not in STAGES or self.input_revision < 1:
            raise AdapterConfigurationError("Unsupported stage or input revision")
        if not self.profile_id or len(self.profile_id) > 100:
            raise AdapterConfigurationError("Invalid profile ID")
        if not isinstance(self.execution_id, UUID) or any(not isinstance(asset, UUID) for asset in self.artifact_ids):
            raise AdapterConfigurationError("Execution and artifacts require scoped UUIDs")


@dataclass(frozen=True)
class AdapterResult:
    execution_id: UUID
    state: Literal["unavailable", "development_diagnostic", "completed"]
    artifact_ids: tuple[UUID, ...]
    implementation_version: str
    simulated: bool

    @property
    def eligible_for_validation(self) -> bool:
        # This permits content validation only. Publication still requires the API's
        # independent source/privacy/author/reviewer and immutable-version checks.
        return self.state == "completed" and not self.simulated


class ProcessingAdapter(Protocol):
    version: str
    def execute(self, request: StageRequest) -> AdapterResult: ...


class UnavailableAdapter:
    version = "unavailable-v1"

    def execute(self, request: StageRequest) -> AdapterResult:
        return AdapterResult(request.execution_id, "unavailable", (), self.version, False)


class DevelopmentSimulator:
    version = "development-diagnostic-v1"

    def __init__(self, *, deployment: str, explicitly_enabled: bool):
        if deployment != "development" or not explicitly_enabled:
            raise AdapterConfigurationError("Simulator requires explicit development configuration")

    def execute(self, request: StageRequest) -> AdapterResult:
        # No invented OCR facts, geometry, images, cameras or reconstructed artifacts.
        return AdapterResult(request.execution_id, "development_diagnostic", (), self.version, True)


def configure_adapter(environment: Mapping[str, str]) -> ProcessingAdapter:
    deployment = environment.get("PROCESSING_DEPLOYMENT", "production")
    if deployment not in ("development", "test", "staging", "production"):
        raise AdapterConfigurationError("Unknown deployment environment")
    name = environment.get("PROCESSING_ADAPTER", "unavailable")
    enabled = environment.get("PROCESSING_ENABLE_SIMULATOR", "false")
    if enabled not in ("true", "false"):
        raise AdapterConfigurationError("Simulator flag must be true or false")
    if enabled == "true" and deployment != "development":
        raise AdapterConfigurationError("Simulator flag forbidden outside development")
    if name == "simulator":
        return DevelopmentSimulator(deployment=deployment, explicitly_enabled=enabled == "true")
    if name != "unavailable":
        raise AdapterConfigurationError("Adapter is not installed and approved")
    return UnavailableAdapter()
