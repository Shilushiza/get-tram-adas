"""Иконка приложения: трамвай с пантографом у провода, как логотип в шапке сайта.

Пишет launcher/app.ico (ярлык, трей) и frontend/public/icon.png (вкладка и окно приложения).
Запуск: python launcher/make_icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
INK, BODY, GLASS, WIRE = "#1c232d", "#D55E00", "#1c232d", "#c9d2db"


def draw(size: int = 256) -> Image.Image:
    s = size / 64  # рисуем в координатах логотипа 64×64
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    g.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(14 * s), fill=INK)
    w = max(1, int(1.8 * s))
    g.line([(6 * s, 14 * s), (58 * s, 14 * s)], fill=WIRE, width=w)              # контактный провод
    g.line([(30 * s, 27 * s), (37 * s, 20 * s), (31 * s, 14.5 * s)], fill=WIRE, width=w)  # пантограф
    g.rounded_rectangle([8 * s, 27 * s, 56 * s, 43 * s], radius=int(4 * s), fill=BODY)  # кузов
    g.rounded_rectangle([12 * s, 30 * s, 46 * s, 35.5 * s], radius=int(1.2 * s), fill=GLASS)  # окна
    g.polygon([(49 * s, 30 * s), (54 * s, 30 * s), (53 * s, 35.5 * s), (49 * s, 35.5 * s)], fill=GLASS)  # лобовое
    for cx in (16, 24, 40, 48):
        r = 2.8 * s
        g.ellipse([cx * s - r, 46 * s - r, cx * s + r, 46 * s + r], fill=WIRE)  # колёса
    g.line([(6 * s, 50 * s), (58 * s, 50 * s)], fill=WIRE, width=w)              # рельс
    return im


def main():
    big = draw(256)
    big.save(ROOT / "launcher" / "app.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    pub = ROOT / "frontend" / "public"
    pub.mkdir(parents=True, exist_ok=True)
    big.resize((192, 192), Image.LANCZOS).save(pub / "icon.png")
    print("ok:", ROOT / "launcher" / "app.ico", pub / "icon.png")


if __name__ == "__main__":
    main()
