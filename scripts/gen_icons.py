#!/usr/bin/env python3
"""Generate the Tauri icon set (PNG, ICO, ICNS) from scratch.

Pure-stdlib implementation: draws a rounded square with a stylized "N"
glyph, then wraps the PNGs into ICO/ICNS containers. Run from repo root:
    python3 scripts/gen_icons.py
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src-tauri", "icons")
os.makedirs(OUT, exist_ok=True)


def _chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def render_png(size: int) -> bytes:
    """Render the logo directly at `size` x `size` pixels."""
    bg_top = (79, 140, 255)   # accent blue
    bg_bot = (34, 211, 238)   # cyan
    glyph = (6, 16, 31)       # near-black

    radius = max(size // 6, 2)
    inset = max(size // 14, 1)
    bar_w = max(size // 7, 2)
    left = size // 3 - bar_w // 2
    right = (2 * size) // 3 - bar_w // 2
    top = size // 4
    bottom = size - size // 4

    def inside_rounded(x: int, y: int) -> bool:
        if x < inset or y < inset or x >= size - inset or y >= size - inset:
            return False
        cx = min(max(x, inset + radius), size - inset - 1 - radius)
        cy = min(max(y, inset + radius), size - inset - 1 - radius)
        dx, dy = x - cx, y - cy
        return dx * dx + dy * dy <= radius * radius

    def on_glyph(x: int, y: int) -> bool:
        if left <= x < left + bar_w and top <= y < bottom:
            return True
        if right <= x < right + bar_w and top <= y < bottom:
            return True
        if top <= y < bottom and left <= x < right + bar_w:
            t = (y - top) / max(bottom - top - 1, 1)
            diag = left + t * (right - left)
            if diag <= x < diag + bar_w:
                return True
        return False

    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter type: None
        for x in range(size):
            if not inside_rounded(x, y):
                rows += bytes((0, 0, 0, 0))
                continue
            t = y / max(size - 1, 1)
            r = int(bg_top[0] + (bg_bot[0] - bg_top[0]) * t)
            g = int(bg_top[1] + (bg_bot[1] - bg_top[1]) * t)
            b = int(bg_top[2] + (bg_bot[2] - bg_top[2]) * t)
            if on_glyph(x, y):
                r, g, b = glyph
            rows += bytes((r, g, b, 255))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + _chunk(b"IEND", b"")
    )


def _write_ico(path: str, pngs: dict) -> None:
    """ICO container embedding PNG images (supported since Vista)."""
    images = [(pngs[32], 32), (pngs[128], 128)]
    header = struct.pack("<HHH", 0, 1, len(images))
    entries = b""
    data = b""
    offset = 6 + 16 * len(images)
    for raw, size in images:
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(raw), offset)
        data += raw
        offset += len(raw)
    with open(path, "wb") as f:
        f.write(header + entries + data)


def _write_icns(path: str, pngs: dict) -> None:
    """ICNS container with PNG-based icon types."""
    types = [
        (b"ic07", 128),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic11", 32),
        (b"ic12", 64),
        (b"ic13", 256),
        (b"ic14", 512),
    ]
    body = b""
    for t, size in types:
        raw = pngs[size]
        body += t + struct.pack(">I", len(raw) + 8) + raw
    with open(path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", 8 + len(body)) + body)


def main() -> None:
    pngs = {s: render_png(s) for s in (32, 64, 128, 256, 512)}

    for name, size in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256)]:
        path = os.path.join(OUT, name)
        with open(path, "wb") as f:
            f.write(pngs[size])
        print(f"wrote {path}")

    ico = os.path.join(OUT, "icon.ico")
    _write_ico(ico, pngs)
    print(f"wrote {ico}")

    icns = os.path.join(OUT, "icon.icns")
    _write_icns(icns, pngs)
    print(f"wrote {icns}")


if __name__ == "__main__":
    main()
