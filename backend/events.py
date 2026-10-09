"""Детектор эпизодов АБПВ и извлечение проверяемых фактов.

Работает на единой таблице поездки (prepare.py): CSV-флаги срабатываний + поля JSON.
Эпизод: воздействие подсистемы (обнаружение препятствий, светофоры, ограничение скорости),
рельсовый/аварийный/экстренный тормоз или юз. Срабатывания ближе GAP секунд объединяются.
Каждый факт хранит время и поле-источник, поэтому разбор проверяется по исходным данным.
Причина указывается только если есть подтверждающее поле, иначе пишем, что она не установлена.
"""
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

GAP = 8.0               # с: объединяем срабатывания ближе этого
PRE, POST = 15.0, 15.0  # с: контекст до и после эпизода
MAX_SPEED = 100.0       # км/ч: выше считаем выбросом датчика

SUBSYS = {  # kind: (запрос, применено, работает, название)
    "danger": ("danger_act", "danger_real", "danger_work", "обнаружения препятствий"),
    "traffic_light": ("tl_act", "tl_real", "tl_work", "контроля светофоров"),
    "speed_limit": ("sl_act", "sl_real", "sl_work", "ограничения скорости"),
}
HARD_BRAKES = {"brake_rail": "рельсовый тормоз", "brake_crash": "аварийный тормоз", "brake_emergency": "экстренный тормоз"}
KIND_ORDER = ["danger", "traffic_light", "hard_brake", "skid", "speed_limit"]
KIND_RU = {"danger": "препятствие", "traffic_light": "светофор", "hard_brake": "экстренное торможение",
           "skid": "юз", "speed_limit": "ограничение скорости"}
OBJ_RU = {"Ped": "пешеход", "Vehicle": "автомобиль", "Tram": "трамвай", "Obstacle": "препятствие",
          "TrafficLightSignal": "сигнал светофора", "Unknown": "не определён"}
HARD_BRAKES_EN = {"brake_mech": "mechanical brake", "brake_rail": "rail brake", "brake_crash": "crash brake",
                  "brake_emergency": "emergency brake"}
SUBSYS_EN = {"danger": "obstacle detection", "traffic_light": "traffic-light control", "speed_limit": "speed limit"}
OBJ_EN = {"Ped": "pedestrian", "Vehicle": "car", "Tram": "tram", "Obstacle": "obstacle",
          "TrafficLightSignal": "traffic signal", "Unknown": "unknown"}
CTRL_EN = {"driver": "driver", "auto": "assistant", "und": "undetermined"}
STATUS_EN = {"m_danger_obj_status": "obstacle detection", "m_trafficlight_status": "traffic-light recognition",
             "m_speed_limit_status": "speed limit"}
SENSOR_EN = {"ubloxGps": "GPS", "t25Front": "front camera", "leftImage": "left camera", "tramSlaveVisor": "auxiliary camera",
             "minsEth": "inertial unit", "odoFbTram": "odometry", "dbwFbTram": "drive-by-wire feedback"}
CTRL_RU = {"driver": "водитель", "auto": "ассистент", "und": "не определено"}
STATUS_COLS = {"m_danger_obj_status": "обнаружение препятствий", "m_trafficlight_status": "распознавание светофоров",
               "m_speed_limit_status": "ограничение скорости"}
SENSOR_COLS = {"ubloxGps": "GPS", "t25Front": "передняя камера", "leftImage": "левая камера",
               "tramSlaveVisor": "вспомогательная камера", "minsEth": "инерциальная система",
               "odoFbTram": "одометрия", "dbwFbTram": "обратная связь управления"}


@dataclass
class Fact:
    t: str           # ISO-время
    section: str     # circumstances | reaction | result | limits
    text: str
    field: str       # поле-источник
    value: str = ""
    text_en: str = ""


@dataclass
class Episode:
    id: str
    trip: str
    wagon: str
    start: str
    end: str
    win_start: str
    win_end: str
    kind: str
    kinds: list
    obj_type: str
    route: str
    stop: str
    lat: float | None
    lon: float | None
    speed_start: float
    speed_min: float
    speed_end: float
    max_decel: float             # м/с²
    warn_max: float
    reaction_s: float | None     # запрос воздействия/предупреждение -> применённое торможение
    stopped: bool
    controller: str
    hard_brakes: list = field(default_factory=list)
    hard_brakes_en: list = field(default_factory=list)
    skid: bool = False
    facts: list = field(default_factory=list)
    severity: int = 0
    anomaly: float = 0.0


def _ts(t) -> str:
    return pd.Timestamp(t).isoformat()


def _hms(t) -> str:
    return pd.Timestamp(t).strftime("%H:%M:%S")


def _flag(df: pd.DataFrame, c: str) -> pd.Series:
    if c not in df:
        return pd.Series(False, index=df.index)
    return pd.to_numeric(df[c], errors="coerce").fillna(0) > 0.5


def _onsets(f: pd.Series) -> pd.Index:
    return f.index[f & ~f.shift(fill_value=False)]


def _num(x, nd=1):
    try:
        x = float(x)
        return None if np.isnan(x) else round(x, nd)
    except (TypeError, ValueError):
        return None


def _str(x) -> str:
    return "" if x is None or (isinstance(x, float) and np.isnan(x)) or str(x) == "nan" else str(x)


def _stable_switches(w: pd.DataFrame, hold: float = 3.0):
    """Переключения источника управления, которые держались не меньше hold секунд (без дребезга)."""
    ctrl = w["controller"].astype(str)
    runs = ctrl.ne(ctrl.shift()).cumsum()
    seg = w.groupby(runs).agg(i=("t", lambda x: x.index[0]), t0=("t", "first"), t1=("t", "last"))
    seg["c"] = ctrl.groupby(runs).first()
    seg["dur"] = (seg.t1 - seg.t0).dt.total_seconds()
    seg = seg[(seg.dur >= hold) | (seg.index == seg.index[-1])]
    seg = seg[seg.c.ne(seg.c.shift())]
    return [(r.i, seg.c.shift()[k], r.c) for k, r in seg.iloc[1:].iterrows()]


def trigger_kinds(df: pd.DataFrame) -> dict[str, pd.Series]:
    out = {k: _flag(df, real) for k, (_, real, _, _) in SUBSYS.items()}
    hb = pd.Series(False, index=df.index)
    for c in HARD_BRAKES:
        hb |= _flag(df, c)
    out["hard_brake"] = hb
    out["skid"] = _flag(df, "as_is_skid")
    return out


def _groups(df: pd.DataFrame, mask: pd.Series):
    times = df.loc[mask, "t"]
    if times.empty:
        return []
    groups, s = [], times.index[0]
    last, prev = s, times.iloc[0]
    for i, t in times.iloc[1:].items():
        if (t - prev).total_seconds() > GAP:
            groups.append((s, last))
            s = i
        last, prev = i, t
    groups.append((s, last))
    return groups


def segment(df: pd.DataFrame):
    """Индексы (start, end) групп срабатываний.

    Основные срабатывания (препятствие, светофор, тормоза, юз) группируются отдельно;
    ограничение скорости срабатывает часто, поэтому становится эпизодом, только если рядом нет основного.
    """
    kinds = trigger_kinds(df)
    primary = kinds["danger"] | kinds["traffic_light"] | kinds["hard_brake"] | kinds["skid"]
    groups = _groups(df, primary)
    near = pd.Series(False, index=df.index)
    for s, e in groups:
        near |= (df.t >= df.at[s, "t"] - pd.Timedelta(seconds=GAP)) & (df.t <= df.at[e, "t"] + pd.Timedelta(seconds=GAP))
    groups += _groups(df, kinds["speed_limit"] & ~near)
    return sorted(groups)


def build_episode(df: pd.DataFrame, s, e, n: int) -> Episode:
    t0, t1 = df.at[s, "t"], df.at[e, "t"]
    w = df[(df.t >= t0 - pd.Timedelta(seconds=PRE)) & (df.t <= t1 + pd.Timedelta(seconds=POST))]
    core = df.loc[s:e]
    has_json = "fsm_state" in w and w["fsm_state"].notna().any()
    facts: list[Fact] = []

    def F(t, section, ru, en, field_, value=""):
        facts.append(Fact(_ts(t), section, ru, field_, value, en))

    trig = trigger_kinds(core)
    kinds = [k for k in KIND_ORDER if trig[k].any()]
    kind = kinds[0]
    hard = [name for c, name in HARD_BRAKES.items() if _flag(core, c).any()]
    hard_en = [HARD_BRAKES_EN[c] for c in HARD_BRAKES if _flag(core, c).any()]

    speed = w["speed"].where(w["speed"] <= MAX_SPEED).ffill()
    r0 = w.iloc[0]
    c0 = _str(r0.controller)

    # --- обстоятельства
    stop = _str(core["stop_name"].dropna().iloc[0]) if "stop_name" in core and core["stop_name"].notna().any() else ""
    lead = (t0 - r0.t).total_seconds()
    ru = (f"За {lead:.0f} с до срабатывания: скорость {speed.iloc[0]:.1f} км/ч, "
          f"управление: {CTRL_RU.get(c0, c0)}, маршрут {_str(r0.route)}")
    en = (f"{lead:.0f} s before the trigger: speed {speed.iloc[0]:.1f} km/h, "
          f"control: {CTRL_EN.get(c0, c0)}, route {_str(r0.route)}")
    if stop:
        ru += f", рядом остановка «{stop}»"
        en += f", near stop \u201c{stop}\u201d"
    F(r0.t, "circumstances", ru + ".", en + ".", "speed, controller, route, stop_name")
    if has_json and _str(r0.get("fsm_state")):
        st = _str(r0.fsm_state)
        F(r0.t, "circumstances", f"Режим автомата управления: «{st}».", f"Control state machine: {st}.", "fsm_state", st)

    obj_type = "Unknown"
    if has_json:
        obj = w.loc[w.t <= t1, "goal_obj_type"].astype(str)
        known = obj[~obj.isin(["Unknown", "nan", "None"])]
        if len(known):
            obj_type = known.iloc[-1]
            r = w.loc[known.index[0]]
            v = speed.loc[known.index[0]]
            has_gs = pd.notna(r.get("goal_speed"))
            F(r.t, "circumstances",
              f"В {_hms(r.t)} объект, задающий скорость: {OBJ_RU.get(obj_type, obj_type)}; "
              + (f"требуемая скорость {r.goal_speed:.0f} км/ч, " if has_gs else "") + f"текущая {v:.1f} км/ч.",
              f"At {_hms(r.t)} the speed-defining object: {OBJ_EN.get(obj_type, obj_type)}; "
              + (f"target speed {r.goal_speed:.0f} km/h, " if has_gs else "") + f"actual {v:.1f} km/h.",
              "goal_obj_type, goal_speed, speed", obj_type)
    if obj_type == "Unknown" and kind in ("danger", "hard_brake", "skid"):
        F(t0, "circumstances",
          "Тип объекта в данных не указан (goal_obj_type = Unknown или нет записи), причина срабатывания не установлена.",
          "Object type is not recorded (goal_obj_type = Unknown or missing); the cause is not established.",
          "goal_obj_type", "Unknown")
    if kind == "traffic_light" and obj_type != "TrafficLightSignal":
        F(t0, "circumstances", "Срабатывание подсистемы контроля светофоров; цвет сигнала в данных не записан.",
          "Traffic-light subsystem triggered; the signal colour is not recorded.", "tl_real")

    # --- реакция системы
    req_t = real_t = None
    for k, (act, real, _, name) in SUBSYS.items():
        fa, fr = _flag(w, act), _flag(w, real)
        if k not in kinds and not fa.loc[s:e].any():
            continue
        for i in _onsets(fa)[:2]:
            ti = w.at[i, "t"]
            req_t = ti if req_t is None else min(req_t, ti)
            F(ti, "reaction", f"В {_hms(ti)} подсистема {name} запросила воздействие.",
              f"At {_hms(ti)} the {SUBSYS_EN[k]} subsystem requested an intervention.", act, "1")
        for i in _onsets(fr)[:2]:
            ti = w.at[i, "t"]
            real_t = ti if real_t is None else min(real_t, ti)
            ha = _num(w.at[i, "handle_assistant"], 0)
            F(ti, "reaction",
              f"В {_hms(ti)} воздействие подсистемы {name} применено (скорость {speed.loc[i]:.1f} км/ч"
              + (f", рукоятка ассистента {ha:+.0f}" if ha is not None else "") + ").",
              f"At {_hms(ti)} the {SUBSYS_EN[k]} intervention was applied (speed {speed.loc[i]:.1f} km/h"
              + (f", assistant handle {ha:+.0f}" if ha is not None else "") + ").",
              f"{real}, handle_assistant", "1")
    warn_t = None
    if has_json:
        wl = pd.to_numeric(w["m_warn_level"], errors="coerce").fillna(0)
        if (wl > 0).any():
            i = wl.index[wl > 0][0]
            warn_t = w.at[i, "t"]
            F(warn_t, "reaction", f"В {_hms(warn_t)} на интерфейсе водителя выведено предупреждение (m_warn_level = {wl.max():.0f}).",
              f"At {_hms(warn_t)} a warning was shown to the driver (m_warn_level = {wl.max():.0f}).",
              "m_warn_level", f"{wl.max():.0f}")
    for i, a, b in _stable_switches(w):
        ti = w.at[i, "t"]
        F(ti, "reaction", f"В {_hms(ti)} управление перешло: {CTRL_RU.get(a, a)} → {CTRL_RU.get(b, b)}.",
          f"At {_hms(ti)} control passed: {CTRL_EN.get(a, a)} → {CTRL_EN.get(b, b)}.", "controller", b)
    hd = pd.to_numeric(w["handle_driver"], errors="coerce")
    for i in hd.index[(hd < 0) & ~(hd.shift() < 0)][:2]:
        ti = w.at[i, "t"]
        F(ti, "reaction", f"В {_hms(ti)} водитель перевёл рукоятку в торможение ({hd[i]:+.0f}).",
          f"At {_hms(ti)} the driver moved the handle to braking ({hd[i]:+.0f}).", "handle_driver", f"{hd[i]:.0f}")
    for c, name in {"brake_mech": "механический тормоз", **HARD_BRAKES}.items():
        for i in _onsets(_flag(w, c))[:2]:
            ti = w.at[i, "t"]
            F(ti, "reaction", f"В {_hms(ti)} включён {name}.", f"At {_hms(ti)} the {HARD_BRAKES_EN[c]} engaged.", c, "1")
    skid = bool(_flag(w, "as_is_skid").any())
    if skid:
        ti = w.at[_onsets(_flag(w, "as_is_skid"))[0], "t"]
        F(ti, "reaction", f"В {_hms(ti)} противоюзовая система зафиксировала скольжение колёс.",
          f"At {_hms(ti)} the anti-skid system detected wheel slip.", "as_is_skid", "1")

    # --- результат
    dt = w["t"].diff().dt.total_seconds()
    acc = (speed.diff() / 3.6) / dt.where(dt >= 1)
    max_decel = float(np.nan_to_num(-acc[dt <= 6].min())) if acc.notna().any() else 0.0
    after = speed.loc[s:]
    stopped = bool((after < 0.5).any())
    vmin_i = after.idxmin() if after.notna().any() else w.index[-1]
    sp_start = float(speed.loc[:s].iloc[-1]) if speed.loc[:s].notna().any() else float("nan")
    rend = w.iloc[-1]
    tm = w.at[vmin_i, "t"]
    if stopped:
        F(tm, "result", f"В {_hms(tm)} трамвай остановился.", f"At {_hms(tm)} the tram stopped.", "speed", f"{speed[vmin_i]:.1f}")
    else:
        F(tm, "result", f"Минимальная скорость {speed[vmin_i]:.1f} км/ч в {_hms(tm)}, полной остановки не было.",
          f"Minimum speed {speed[vmin_i]:.1f} km/h at {_hms(tm)}; no full stop.", "speed", f"{speed[vmin_i]:.1f}")
    if max_decel > 0.3:
        F(t0, "result", f"Наибольшее замедление по скорости между записями: {max_decel:.2f} м/с².",
          f"Peak deceleration between records: {max_decel:.2f} m/s².", "speed")
    ce = _str(rend.controller)
    F(rend.t, "result", f"В {_hms(rend.t)}: скорость {speed.iloc[-1]:.1f} км/ч, управление: {CTRL_RU.get(ce, ce)}.",
      f"At {_hms(rend.t)}: speed {speed.iloc[-1]:.1f} km/h, control: {CTRL_EN.get(ce, ce)}.", "speed, controller")

    # --- ограничения анализа
    gaps = dt[dt > 5.5]
    if len(gaps):
        F(w.at[gaps.index[0], "t"], "limits", f"Шаг записи в окне до {gaps.max():.0f} с: что происходило между точками, неизвестно.",
          f"Sampling gaps up to {gaps.max():.0f} s: what happened between records is unknown.", "t")
    F(t0, "limits", "Время в CSV записано с точностью до секунды; порядок событий внутри одной секунды не установлен.",
      "CSV time has 1 s resolution; the order of events within one second is unknown.", "date")
    if not has_json:
        F(t0, "limits", "Для этого момента нет детальной записи бортовой системы (JSON): тип объекта, "
          "уровень предупреждения и состояние датчиков неизвестны.",
          "No detailed onboard record (JSON) for this moment: object type, warning level and sensor state are unknown.", "-")
    if (w["speed"] > MAX_SPEED).any():
        F(w.loc[w.speed > MAX_SPEED, "t"].iloc[0], "limits", "Есть невалидные значения скорости, они исключены.",
          "Invalid speed values were excluded.", "speed")
    if "loc_converged" in w and not _flag(w, "loc_converged").all():
        F(t0, "limits", "Локализация не сошлась на части эпизода: координаты приблизительные.",
          "Localisation did not converge for part of the episode: coordinates are approximate.", "locConverged")
    for k, (_, _, work, name) in SUBSYS.items():
        if k in kinds and not _flag(w, work).all():
            F(t0, "limits", f"Подсистема {name} была не в рабочем режиме на части окна.",
              f"The {SUBSYS_EN[k]} subsystem was not operational for part of the window.", work)
    if has_json:
        for c, name in STATUS_COLS.items():
            if c in w and w[c].astype(str).isin(["Error", "TemporaryOff"]).any():
                F(t0, "limits", f"Подсистема «{name}» временно отключалась или была в ошибке.",
                  f"Subsystem {STATUS_EN[c]} was temporarily off or in error.", c)
        for c, name in SENSOR_COLS.items():
            if c in w and w[c].notna().any() and (~_flag(w, c) & w[c].notna()).any():
                F(w.loc[~_flag(w, c) & w[c].notna(), "t"].iloc[0], "limits", f"Пропадали данные: {name}.",
                  f"Data dropouts: {SENSOR_EN[c]}.", c)
    F(t0, "limits", "Расстояние до объекта и его положение не записаны; на реконструкции объект показан условно.",
      "Distance to the object and its position are not recorded; the reconstruction shows it schematically.", "-")

    order = ["circumstances", "reaction", "result", "limits"]
    seen, uniq = set(), []
    for f in facts:
        key = (f.section, f.t, f.field.split(",")[0])
        if key not in seen:
            seen.add(key)
            uniq.append(f)
    facts = sorted(uniq, key=lambda f: (order.index(f.section), f.t))

    first = real_t
    base = req_t if req_t is not None else warn_t
    severity = 3 if any(h != "рельсовый тормоз" for h in hard) else 2 if (hard or skid or "danger" in kinds) else \
        1 if "traffic_light" in kinds else 0
    return Episode(
        id=f"{df.at[s, 'trip']}#{n:04d}", trip=str(df.at[s, "trip"]), wagon=str(df.at[s, "wagon"]),
        start=_ts(t0), end=_ts(t1), win_start=_ts(w.t.iloc[0]), win_end=_ts(w.t.iloc[-1]),
        kind=kind, kinds=kinds, obj_type=obj_type, route=_str(core["route"].iloc[0]), stop=stop,
        lat=_num(core["lat"].iloc[0], 6), lon=_num(core["lon"].iloc[0], 6),
        speed_start=round(float(np.nan_to_num(sp_start)), 1), speed_min=round(float(np.nan_to_num(speed[vmin_i])), 1),
        speed_end=round(float(np.nan_to_num(speed.iloc[-1])), 1), max_decel=round(max(max_decel, 0.0), 2),
        warn_max=float(pd.to_numeric(w.get("m_warn_level"), errors="coerce").max()) if has_json else 0.0,
        reaction_s=round((first - base).total_seconds(), 1) if first is not None and base is not None and first >= base else None,
        stopped=stopped, controller=_str(core["controller"].iloc[0]), hard_brakes=hard, hard_brakes_en=hard_en, skid=skid,
        facts=[asdict(f) for f in facts], severity=severity,
    )


def detect(df: pd.DataFrame) -> list[dict]:
    df = df.sort_values("t", kind="stable").reset_index(drop=True)
    return [asdict(build_episode(df, s, e, n)) for n, (s, e) in enumerate(segment(df), 1)]


def score(eps: list[dict]) -> list[dict]:
    """Необычность эпизода: максимальный робастный z-score признаков внутри своего типа."""
    if not eps:
        return eps
    d = pd.DataFrame(eps)
    d["drop"] = d.speed_start - d.speed_min
    d["dur"] = (pd.to_datetime(d.end) - pd.to_datetime(d.start)).dt.total_seconds()
    feats = ["max_decel", "drop", "dur", "warn_max"]
    z = pd.DataFrame(index=d.index)
    for f in feats:
        g = d.groupby("kind")[f]
        med = g.transform("median")
        mad = g.transform(lambda x: (x - x.median()).abs().median()).replace(0, np.nan)
        z[f] = ((d[f] - med).abs() / (1.4826 * mad)).fillna(0).clip(0, 20)
    for e, a in zip(eps, z.max(axis=1)):
        e["anomaly"] = round(float(a), 2)
    return eps
