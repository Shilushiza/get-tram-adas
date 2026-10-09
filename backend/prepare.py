"""CSV (события АБПВ, остановки) + parquet из JSON (детали бортовой системы) -> единая таблица поездки.

CSV пишется чаще около событий и содержит флаги срабатываний (*Act / *RealAct), JSON содержит
тип объекта, уровень предупреждения, режим автомата, юз и состояние датчиков.
Склейка по ближайшему времени (допуск 3 с), основа шкалы — CSV.

Запуск: python backend/prepare.py   (после ingest.py)
Результат: data/processed/trips/<trip>.parquet, data/processed/trips.json, data/processed/episodes.json
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parent))
from events import detect, score  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "new_data" / "hakathon_new_data"
PROC = ROOT / "data" / "processed"
TRIPS = PROC / "trips"
TOL = pd.Timedelta("3s")

CSV_RENAME = {
    "loco": "wagon_csv", "route": "route", "pathPos": "path_pos_csv", "stopName": "stop_name",
    "distanceToStop": "dist_to_stop", "curveName": "curve_name", "distanceToCurve": "dist_to_curve",
    "locConverged": "loc_converged", "speed": "speed",
    "brakeMech": "brake_mech", "brakeRail": "brake_rail", "brakeCrash": "brake_crash", "brakeEmergency": "brake_emergency",
    "accelDriver": "handle_driver", "accelAssistant": "handle_assistant", "adas": "adas_on",
    "dangObjReq": "danger_req", "dangObjWork": "danger_work", "dangObjAct": "danger_act", "dangObjRealAct": "danger_real",
    "trafLightReq": "tl_req", "trafLightWork": "tl_work", "trafLightAct": "tl_act", "trafLightRealAct": "tl_real",
    "speedLimitReq": "sl_req", "speedLimitWork": "sl_work", "speedLimitAct": "sl_act", "speedLimitRealAct": "sl_real",
    "controller": "controller",
}
JSON_COLS = [
    "t", "latitude", "longitude", "probability", "goal_speed", "goal_obj_type", "m_speed_profile", "m_warn_level",
    "m_speed_mode", "m_speed_mode_driver_fb", "fsm_state", "handle", "as_is_skid", "as_skid_score",
    "m_danger_obj_status", "m_trafficlight_status", "m_speed_limit_status", "m_current_route_name",
    "is_call_turned_on_fb", "is_safety_pedal_turned_on_fb", "m_mains_voltage",
    "ubloxGps", "t25Front", "leftImage", "tramSlaveVisor", "minsEth", "odoFbTram", "dbwFbTram",
]


def read_csv(path: Path) -> pd.DataFrame:
    c = pd.read_csv(path, sep=";", encoding="utf-8", encoding_errors="replace", low_memory=False)
    c["t"] = pd.to_datetime(c["date"], format="%m/%d/%Y %H:%M:%S").dt.tz_localize("Europe/Moscow").dt.as_unit("ms")
    geo = c["geo"].astype(str).str.split(",", expand=True)
    c["lat_csv"] = pd.to_numeric(geo[0], errors="coerce")
    c["lon_csv"] = pd.to_numeric(geo[1], errors="coerce") if geo.shape[1] > 1 else float("nan")
    c = c.rename(columns=CSV_RENAME).drop(columns=["date", "geo", "curveId", "stopId"], errors="ignore")
    for col in c.columns:
        if c[col].dtype == "float64":
            c[col] = c[col].astype("float32")
        elif c[col].dtype == "int64":
            c[col] = c[col].astype("int16")
    return c.sort_values("t", kind="stable").reset_index(drop=True)


def trip_name(csv: Path) -> str:
    wagon = csv.stem.rsplit("_", 1)[-1]
    period = re.sub(rf"_?move_detailed_{wagon}$", "", csv.stem).replace("filtered_", "")
    return f"{wagon}_{period}"


def build(csv: Path, json_df: pd.DataFrame | None = None, trip: str | None = None) -> pd.DataFrame:
    """CSV + (опционально) таблица из JSON -> единая таблица поездки."""
    trip = trip or trip_name(csv)
    c = read_csv(csv)
    jp = PROC / f"{trip}.parquet"
    if json_df is None and jp.exists():
        have = set(pq.read_schema(jp).names)
        json_df = pd.read_parquet(jp, columns=[x for x in JSON_COLS if x in have])
    if json_df is not None:
        j = json_df[[x for x in JSON_COLS if x in json_df]].dropna(subset=["t"])
        j["t"] = j["t"].dt.as_unit("ms")
        j = j.sort_values("t").rename(columns={"t": "t_json"})
        j["t"] = j["t_json"]
        c = pd.merge_asof(c, j, on="t", direction="nearest", tolerance=TOL)
        c = c.drop(columns=["t_json"])
        # координаты: уточнённые из JSON, иначе из CSV
        c["lat"] = c["latitude"].fillna(c["lat_csv"])
        c["lon"] = c["longitude"].fillna(c["lon_csv"])
        c = c.drop(columns=["latitude", "longitude", "lat_csv", "lon_csv"])
    else:
        c = c.rename(columns={"lat_csv": "lat", "lon_csv": "lon"})
    c["trip"] = trip
    c["wagon"] = trip.split("_", 1)[0]
    c = c[c["t"].diff().dt.total_seconds().fillna(1) >= 0]
    return c.reset_index(drop=True)


def trip_summary(df: pd.DataFrame, eps: list) -> dict:
    return {
        "trip": df["trip"].iloc[0], "wagon": df["wagon"].iloc[0], "rows": len(df),
        "start": df["t"].min().isoformat(), "end": df["t"].max().isoformat(),
        "routes": sorted({str(r) for r in df["route"].dropna().unique()})[:20],
        "km": round(float((df["speed"].clip(0, 80) / 3.6 * df["t"].diff().dt.total_seconds().clip(0, 10)).sum() / 1000), 1),
        "episodes": len(eps), "has_json": bool(df["fsm_state"].notna().any()) if "fsm_state" in df else False,
    }


def main():
    TRIPS.mkdir(parents=True, exist_ok=True)
    trips, episodes = [], []
    for csv in sorted(RAW.rglob("*.csv")):
        df = build(csv)
        trip = df["trip"].iloc[0]
        if "--force" in sys.argv or not (TRIPS / f"{trip}.parquet").exists():
            df.to_parquet(TRIPS / f"{trip}.parquet", index=False)
        eps = detect(df)
        episodes += eps
        trips.append(trip_summary(df, eps))
        print(f"{trip}: {len(df)} строк, эпизодов {len(eps)}", flush=True)
        del df
    episodes = score(episodes)
    (PROC / "trips.json").write_text(json.dumps(trips, ensure_ascii=False, indent=1), encoding="utf-8")
    (PROC / "episodes.json").write_text(json.dumps(episodes, ensure_ascii=False), encoding="utf-8")
    print(f"всего эпизодов: {len(episodes)}")


if __name__ == "__main__":
    main()
