"""Новая ссылка на сайт -> QR на 7-м слайде -> пересборка презентации.

    python pitch/update_site_qr.py https://xxx.trycloudflare.com
    python pitch/update_site_qr.py            # возьмёт последний адрес из tools/tunnel.log
"""
import re
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import qrcode
from qrcode.constants import ERROR_CORRECT_M

PITCH = Path(__file__).resolve().parent
ROOT = PITCH.parent


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else None
    if not url:
        log = (ROOT / "tools" / "tunnel.log").read_text(encoding="utf-8", errors="replace")
        found = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", log)
        if not found:
            sys.exit("нет адреса: передайте ссылку аргументом")
        url = found[-1]
    url = url.rstrip("/")
    (PITCH / "site_url.txt").write_text(url, encoding="utf-8")
    q = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=20, border=2)
    q.add_data(url)
    q.make(fit=True)
    out = PITCH / "images" / "qr_site.png"
    q.make_image(fill_color="#0e2240", back_color="white").save(out)
    img = cv2.imdecode(np.fromfile(str(out), dtype=np.uint8), cv2.IMREAD_COLOR)  # imread не читает кириллицу в пути
    decoded = cv2.QRCodeDetector().detectAndDecode(img)[0]
    if decoded != url:
        sys.exit(f"QR не читается как {url}: {decoded!r}")
    print("QR ok:", url)
    subprocess.run([sys.executable, "-X", "utf8", "build.py"], cwd=PITCH / "build_sirius", check=True)
    png = PITCH / "png_sirius"
    for f in png.glob("s-*.png"):
        f.unlink()
    subprocess.run(["pdftoppm", "-png", "-r", "72", str(PITCH / "deck_sirius.pdf"), str(png / "s")], check=True)
    print("презентация пересобрана:", PITCH / "deck_sirius.pdf")


if __name__ == "__main__":
    main()
