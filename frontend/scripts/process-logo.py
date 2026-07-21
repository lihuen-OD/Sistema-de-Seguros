#!/usr/bin/env python3
"""
process-logo.py — Convierte el fondo blanco del logo LOS O'D a transparencia
SIN agujerear las líneas blancas internas que separan los 3 tonos de verde
del ícono (esas líneas son blanco "encerrado", topológicamente inalcanzable
desde el borde de la imagen, así que un flood fill sembrado solo en el
borde nunca las toca).

Uso:
    pip3 install Pillow
    python3 process-logo.py <input_path> <output_path>
"""
import sys
from collections import deque
from PIL import Image

WHITE_THRESHOLD = 235  # mínimo R,G,B para contar como "blanco" de fondo


def is_near_white(px):
    r, g, b = px[0], px[1], px[2]
    return r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD


def flood_fill_background(img):
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = bytearray(w * h)
    q = deque()

    for x in range(w):
        for y in (0, h - 1):
            idx = y * w + x
            if not visited[idx] and is_near_white(px[x, y]):
                visited[idx] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            idx = y * w + x
            if not visited[idx] and is_near_white(px[x, y]):
                visited[idx] = 1
                q.append((x, y))

    reached = []
    while q:
        x, y = q.popleft()
        reached.append((x, y))
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx] and is_near_white(px[nx, ny]):
                    visited[idx] = 1
                    q.append((nx, ny))

    for x, y in reached:
        r, g, b, _a = px[x, y]
        px[x, y] = (r, g, b, 0)

    return img, len(reached), w * h


def main():
    if len(sys.argv) != 3:
        print("Uso: python3 process-logo.py <input_path> <output_path>")
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    img = Image.open(src)
    result, changed, total = flood_fill_background(img)
    result.save(dst, "PNG")
    print(f"{src} -> {dst}: {changed}/{total} px hechos transparentes ({100*changed/total:.1f}%)")


if __name__ == "__main__":
    main()
