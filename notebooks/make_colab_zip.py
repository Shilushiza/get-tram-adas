"""Собирает notebooks/data_for_colab.zip: trips/*.parquet (только нужные колонки) + episodes.json без facts.

Запуск из корня проекта или из notebooks/:  python notebooks/make_colab_zip.py
"""
import io
import json
import zipfile
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "processed"
OUT = ROOT / "notebooks" / "data_for_colab.zip"

COLS = [
    "t", "trip", "wagon", "route", "speed", "goal_speed", "goal_obj_type", "m_warn_level",
    "controller", "handle_driver", "handle_assistant",
    "brake_mech", "brake_rail", "brake_crash", "brake_emergency", "as_is_skid",
    "danger_act", "danger_real", "danger_work", "tl_act", "tl_real", "tl_work",
    "sl_act", "sl_real", "sl_work", "adas_on", "stop_name", "dist_to_stop", "lat", "lon",
    "fsm_state", "m_speed_mode", "probability", "loc_converged", "is_safety_pedal_turned_on_fb",
    "m_danger_obj_status",
    "ubloxGps", "t25Front", "leftImage", "tramSlaveVisor", "minsEth", "odoFbTram", "dbwFbTram",
]


def main():
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted((SRC / "trips").glob("*.parquet")):
            have = pq.ParquetFile(p).schema_arrow.names
            tab = pq.read_table(p, columns=[c for c in COLS if c in have])
            buf = io.BytesIO()
            pq.write_table(tab, buf, compression="zstd")
            z.writestr(f"trips/{p.name}", buf.getvalue())
        eps = json.loads((SRC / "episodes.json").read_text(encoding="utf-8"))
        for e in eps:
            e.pop("facts", None)
        z.writestr("episodes.json", json.dumps(eps, ensure_ascii=False))
        z.write(SRC / "fields.json", "fields.json")
    print(OUT, round(OUT.stat().st_size / 2**20, 2), "МБ")


if __name__ == "__main__":
    main()
