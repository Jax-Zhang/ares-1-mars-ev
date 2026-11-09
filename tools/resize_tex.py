"""Resize one texture image: resize_tex.py <in> <out.jpg> <size>"""
import sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src)
if im.mode not in ("RGB", "L"):
    im = im.convert("RGB")
if im.width > size:
    im = im.resize((size, size), Image.LANCZOS)
im.save(dst, "JPEG", quality=88, optimize=True)
