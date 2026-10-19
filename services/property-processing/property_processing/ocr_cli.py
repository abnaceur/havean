"""Private typed OCR execution child; parser failures never return source text."""
import json
import sys
from .ocr_cpu import recognize


def main():
    try:
        directory,name,locale,checksum=sys.argv[1:]
        result=recognize(directory,name,locale,checksum)
        print(json.dumps({'ok':True,'result':result},ensure_ascii=False,allow_nan=False))
        return 0
    except Exception:
        print(json.dumps({'ok':False,'code':'SOURCE_OCR_FAILED'}))
        return 1


if __name__=='__main__':
    sys.exit(main())
