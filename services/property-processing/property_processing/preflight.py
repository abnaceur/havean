"""Image build preflight, not a running job service or reconstruction simulator."""
import json
import os
from .adapters import configure_adapter
import platform
import pypdf
from .pdf_raster import verified_pdfium
from PIL import Image

if __name__ == "__main__":
    adapter = configure_adapter(os.environ)
    verified_pdfium()
    print(json.dumps({"adapterVersion": adapter.version,"python": platform.python_version(), "pypdf": pypdf.__version__,
                      "pillow": Image.__version__, "ocrAvailable": False,
                      "reconstructionAvailable": False,
                      "capabilities": ["native_pdf_inspection", "pdf_rasterization", "image_orientation"]}))
