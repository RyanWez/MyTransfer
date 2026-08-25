#!/usr/bin/env python3
"""Generate MyShare PWA icons from the existing favicon.

The favicon (brass cloud + OTP dots) is the brand — the PWA icons are
derived from it, flattened onto black so they read as one solid tile on
home screens. Run from repo root:  python3 scripts/gen_icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
os.makedirs(OUT, exist_ok=True)

BLACK = (0, 0, 0, 255)


def load_logo() -> Image.Image:
    """The cloud artwork from the favicon, trimmed to its content box."""
    src = Image.open(os.path.join(ROOT, "src", "app", "favicon.ico")).convert("RGBA")
    bbox = src.split()[3].getbbox()
    return src.crop(bbox)


LOGO = load_logo()


def make(size: int, path: str, *, logo_scale: float = 1.0, rounded: bool = True):
    """Black tile with the cloud centered; logo_scale shrinks it for masks.

    rounded=True clips the tile to a modern ~22.5% squircle (the iOS ratio)
    with transparent corners — desktop installs show the PNG as-is, so a raw
    square would look dated. Maskable icons stay full-bleed because the
    launcher itself crops them to its own shape.
    """
    img = Image.new("RGBA", (size, size), BLACK)
    logo_size = round(size * logo_scale)
    logo = LOGO.resize((logo_size, round(logo_size * LOGO.height / LOGO.width)), Image.LANCZOS)
    pos = ((size - logo.width) // 2, (size - logo.height) // 2)
    img.alpha_composite(logo, pos)
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=round(size * 0.225), fill=255
        )
        img.putalpha(mask)
    img.save(path)
    print(f"wrote {path} ({size}x{size})")


# Standard icons — favicon proportions on a rounded tile.
make(192, os.path.join(OUT, "icon-192.png"))
make(512, os.path.join(OUT, "icon-512.png"))
# Maskable: launcher may crop to the central ~80% circle — full-bleed square.
make(512, os.path.join(OUT, "maskable-512.png"), logo_scale=0.74, rounded=False)
# Apple touch icon: opaque square (iOS applies its own rounded mask).
make(180, os.path.join(OUT, "apple-touch-icon.png"), rounded=False)
