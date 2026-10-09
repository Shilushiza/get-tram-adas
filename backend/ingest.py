"""Сырые .jsonseq (JSON с комментариями //) -> parquet по поездкам + словарь полей.

Запуск: python backend/ingest.py [папка_с_jsonseq ...]
По умолчанию берёт все *.jsonseq из data/raw рекурсивно.
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

LINE = re.compile(r'^\s*"([^"]+)"\s*:\s*"?(.*?)"?\s*,?\s*(?://\s*(.*))?$')

BOOL = {"true": True, "false": False}


def parse_value(v: str):
    if v in BOOL:
        return BOOL[v]
    try:
        return float(v)
    except ValueError:
        return v


def iter_records(path: Path, descriptions: dict):
    """Записи верхнего уровня; вложенные объекты (статистика CAN) пропускаем."""
    rec, depth = {}, 0
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            code = line.split("//", 1)[0]
            opens, closes = code.count("{"), code.count("}")
            if depth == 0 and opens:
                rec = {}
            depth += opens - closes
            if depth == 0 and closes:
                if rec:
                    yield rec
                rec = {}
            elif depth == 1 and not opens:
                m = LINE.match(line)
                if m:
                    key, val, comment = m.groups()
                    rec[key] = parse_value(val)
                    if comment and key not in descriptions:
                        descriptions[key] = comment.strip()


def _normalize(s: pd.Series) -> pd.Series:
    """Смешанные колонки: почти все числа -> float32, иначе строковая category."""
    if s.name == "timestamp":
        return s
    if s.dtype == "float64":
        return s.astype("float32")
    if s.dtype == bool:
        return s
    vals = s.astype(object)
    filled = vals[vals.notna() & (vals != "")]
    num = pd.to_numeric(filled, errors="coerce")
    if len(filled) and num.notna().mean() > 0.99:
        return pd.to_numeric(vals.replace("", None), errors="coerce").astype("float32")
    return vals.where(vals.isna(), vals.astype(str)).astype("category")


def _chunk_frame(rows):
    df = pd.DataFrame(rows).infer_objects()
    return df.apply(_normalize)


def ingest_file(path: Path, descriptions: dict, chunk=50_000) -> pd.DataFrame:
    parts, rows = [], []
    for rec in iter_records(path, descriptions):
        rows.append(rec)
        if len(rows) >= chunk:
            parts.append(_chunk_frame(rows))
            rows = []
    if rows:
        parts.append(_chunk_frame(rows))
    df = pd.concat(parts, ignore_index=True)
    df = df.apply(_normalize)  # после concat типы кусков могли разойтись
    df["t"] = pd.to_datetime(df["timestamp"], format="ISO8601", utc=True).dt.tz_convert("Europe/Moscow")
    df = df.sort_values("t", kind="stable").drop_duplicates().reset_index(drop=True)
    wagon = path.stem.rsplit("_", 1)[-1]
    period = path.stem.replace(f"move_detailed_{wagon}", "").strip("_").replace("filtered_", "")
    df["wagon"] = wagon
    df["trip"] = f"{wagon}_{period}" if period else wagon
    return df


def main(paths):
    OUT.mkdir(parents=True, exist_ok=True)
    files = [p for d in paths for p in (Path(d).rglob("*.jsonseq") if Path(d).is_dir() else [Path(d)])]
    descriptions = {}
    for p in sorted(files):
        df = ingest_file(p, descriptions)
        name = df["trip"].iloc[0]
        df.drop(columns=["t"]).assign(t=df["t"]).to_parquet(OUT / f"{name}.parquet", index=False)
        dt = df["t"].diff().dt.total_seconds().median()
        print(f"{name}: {len(df)} строк, {df['t'].min()} .. {df['t'].max()}, шаг ~{dt:.2f} с, {df.shape[1]} полей", flush=True)
    (OUT / "fields.json").write_text(json.dumps(descriptions, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:] or [RAW / "new_data" / "hakathon_new_data"])
