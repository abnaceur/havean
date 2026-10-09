import json
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import pytest
from property_processing.server import make_server
from property_processing.adapters import AdapterConfigurationError


def test_real_cpu_http_readiness_and_unavailable_execution():
    server = make_server("127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with urlopen(origin + "/health/ready", timeout=2) as response:
            body = json.load(response)
            assert response.headers["Cache-Control"] == "no-store"
            assert body["data"]["capabilities"]["nativePdfAvailable"]
            assert body["data"]["capabilities"]["pdfRasterAvailable"]
            assert not body["data"]["capabilities"]["executionProtocolAvailable"]
            assert body["data"]["capabilities"]["executionProfileIds"] == []
            assert not body["data"]["capabilities"]["ocrAvailable"]
            assert not body["data"]["capabilities"]["reconstructionAvailable"]
        with pytest.raises(HTTPError) as unknown:
            urlopen(origin + "/private-owner.pdf", timeout=2)
        assert unknown.value.code == 404
        with pytest.raises(HTTPError) as disabled:
            urlopen(Request(origin + "/executions", data=b'{}', method="POST"), timeout=2)
        assert disabled.value.code == 503
        assert "owner" not in disabled.value.read().decode()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_production_server_does_not_bind_for_simulator(monkeypatch):
    monkeypatch.setenv("PROCESSING_DEPLOYMENT", "production")
    monkeypatch.setenv("PROCESSING_ADAPTER", "simulator")
    monkeypatch.setenv("PROCESSING_ENABLE_SIMULATOR", "true")
    with pytest.raises(AdapterConfigurationError):
        make_server("127.0.0.1", 0)
