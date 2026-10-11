"""HTTP API для дашборда.

Запуск: python -m uvicorn api:app --app-dir backend --port 8000
"""
import asyncio
import json
import os
import sys
import threading
import time
import uuid
from functools import lru_cache
from pathlib import Path

import httpx
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from events import build_episode, score, segment  # noqa: E402
from ingest import ingest_file  # noqa: E402
from prepare import build, trip_summary  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
TRIPS = PROC / "trips"
NARR = PROC / "narratives"
UPLOADS = ROOT / "data" / "uploads"
VIDEOS = ROOT / "data" / "raw"

SERIES = ["speed", "goal_speed", "handle_driver", "handle_assistant", "m_warn_level",
          "brake_mech", "brake_rail", "brake_crash", "brake_emergency", "as_is_skid",
          "danger_act", "danger_real", "tl_act", "tl_real", "sl_act", "sl_real",
          "controller", "goal_obj_type", "fsm_state", "stop_name", "dist_to_stop", "route", "lat", "lon",
          "t25Front", "leftImage", "tramSlaveVisor", "ubloxGps", "minsEth", "odoFbTram", "dbwFbTram"]


def _env():
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                if v.strip():
                    os.environ.setdefault(k.strip(), v.strip())


_env()
app = FastAPI(title="GET tram episodes")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def _load_episodes():
    """Сводки держим как dict, а факты как сжатые JSON-строки: так API занимает в разы меньше памяти."""
    raw = json.loads((PROC / "episodes.json").read_text(encoding="utf-8"))
    facts = {}
    for e in raw:
        facts[e["id"]] = json.dumps(e.pop("facts"), ensure_ascii=False)
    return raw, facts


EPISODES, FACTS = _load_episodes()
TRIP_LIST: list[dict] = json.loads((PROC / "trips.json").read_text(encoding="utf-8"))
BY_ID = {e["id"]: e for e in EPISODES}
SUMMARY_KEYS = list(EPISODES[0]) if EPISODES else []
LOCK = threading.Lock()


@lru_cache(maxsize=4)
def trip_df(trip: str) -> pd.DataFrame:
    p = TRIPS / f"{trip}.parquet"
    if not p.exists():
        p = UPLOADS / f"{trip}.parquet"
    if not p.exists():
        raise HTTPException(404, "нет такой поездки")
    df = pd.read_parquet(p)
    return df[[c for c in ["t", *SERIES] if c in df]]


def _records(df: pd.DataFrame) -> dict:
    """Колоночный JSON: {t: [ms...], speed: [...], ...}; NaN -> null."""
    out = {"t": ((df["t"] - pd.Timestamp(0, tz="UTC")) // pd.Timedelta(milliseconds=1)).tolist()}
    for c in df.columns:
        if c == "t":
            continue
        s = df[c]
        if pd.api.types.is_numeric_dtype(s) or s.dtype == bool:
            out[c] = [None if (v is None or (isinstance(v, float) and np.isnan(v))) else round(float(v), 3) for v in s.tolist()]
        else:
            out[c] = [None if (v is None or str(v) == "nan") else str(v) for v in s.astype(object).tolist()]
    return out


@app.get("/api/trips")
def trips():
    return TRIP_LIST


@app.get("/api/episodes")
def episodes(trip: str | None = None, kind: str | None = None, min_severity: int = 0, limit: int = 20000):
    out = []
    for e in EPISODES:
        if trip and trip != "all" and e["trip"] != trip:
            continue
        if kind and e["kind"] not in kind.split(","):
            continue
        if e["severity"] < min_severity:
            continue
        out.append({k: e.get(k) for k in SUMMARY_KEYS})
        if len(out) >= limit:
            break
    return out


@app.get("/api/episodes/{eid}")
def episode(eid: str, lang: str = "ru"):
    e = BY_ID.get(eid.replace("~", "#"))
    if not e:
        raise HTTPException(404, "нет такого эпизода")
    return {**e, "facts": json.loads(FACTS[e["id"]]), "narrative": _cached_narrative(e["id"], lang)}


@app.get("/api/series")
def series(trip: str, start: str | None = None, end: str | None = None, max_points: int = 4000):
    df = trip_df(trip)
    if start:
        df = df[df.t >= pd.Timestamp(start)]
    if end:
        df = df[df.t <= pd.Timestamp(end)]
    if len(df) > max_points:  # прореживание, но точки срабатываний сохраняем
        keep = np.zeros(len(df), bool)
        keep[:: int(np.ceil(len(df) / max_points))] = True
        for c in ["danger_real", "tl_real", "brake_rail", "brake_crash", "brake_emergency"]:
            if c in df:
                keep |= (df[c].fillna(0) > 0).to_numpy()
        df = df[keep]
    return _records(df)


# ---------- агрегаты для дашборда ----------

@app.get("/api/stats")
def stats(trip: str = "all", kinds: str = "danger,traffic_light,hard_brake,skid,speed_limit"):
    ks = set(kinds.split(","))
    d = pd.DataFrame([{k: e.get(k) for k in SUMMARY_KEYS} for e in EPISODES
                      if (trip == "all" or e["trip"] == trip)])
    tl = [t for t in TRIP_LIST if trip == "all" or t["trip"] == trip]
    km = sum(t["km"] for t in tl)
    if d.empty:
        return {"total": 0, "km": km}
    d_all = d
    d = d[d.kind.isin(ks)]
    t = pd.to_datetime(d.start, utc=True).dt.tz_convert("Europe/Moscow")
    hours = pd.crosstab(t.dt.hour, d.kind).reindex(range(24), fill_value=0)
    by_wagon = d.groupby("wagon").size()
    km_wagon = pd.Series({w: sum(x["km"] for x in tl if x["wagon"] == w) for w in by_wagon.index})
    sp_bins = list(range(0, 75, 5))
    speed_hist = pd.cut(d.speed_start.clip(0, 70), bins=sp_bins, include_lowest=True).value_counts().sort_index()
    stops = d[d.stop.astype(bool)].groupby("stop").agg(n=("id", "size"), crit=("severity", lambda s: int((s >= 2).sum())))
    stops = stops.sort_values("n", ascending=False).head(12)
    pts = d.dropna(subset=["lat", "lon"])
    pts = pts[(pts.lat > 59) & (pts.lat < 61)]
    if len(pts) > 2500:
        pts = pts.sample(2500, random_state=0, weights=pts.severity + 1)
    days = pd.crosstab(t.dt.strftime("%Y-%m-%d"), d.kind)
    top = d.sort_values(["severity", "anomaly"], ascending=False).head(40)
    return {
        "total": int(len(d)), "total_all": int(len(d_all)), "km": round(km, 1), "trips": len(tl),
        "wagons": sorted(d_all.wagon.unique().tolist()),
        "critical": int((d.severity >= 2).sum()),
        "per100km": round(len(d) / km * 100, 1) if km else None,
        "assist_share": round(float((d.controller == "auto").mean()), 3) if len(d) else 0,
        "stopped_share": round(float(d.stopped.mean()), 3) if len(d) else 0,
        "median_decel": round(float(d.max_decel.median()), 2) if len(d) else 0,
        "by_kind": d.kind.value_counts().to_dict(),
        "by_obj": d[d.obj_type != "Unknown"].obj_type.value_counts().to_dict(),
        "obj_unknown": int((d.obj_type == "Unknown").sum()),
        "by_controller": d.controller.value_counts().to_dict(),
        "by_severity": d.severity.value_counts().sort_index().to_dict(),
        "hours": {"hour": list(range(24)), **{k: hours[k].tolist() for k in hours.columns}},
        "wagons_rate": [{"wagon": w, "n": int(n), "km": round(float(km_wagon[w]), 1),
                         "per100": round(n / km_wagon[w] * 100, 1) if km_wagon[w] else None} for w, n in by_wagon.items()],
        "speed_hist": {"bins": [f"{int(i.left) if i.left > 0 else 0}-{int(i.right)}" for i in speed_hist.index],
                       "n": speed_hist.tolist()},
        "decel": d.max_decel.clip(0, 3).round(1).value_counts().sort_index().to_dict(),
        "stops": [{"stop": s, "n": int(r.n), "crit": int(r.crit)} for s, r in stops.iterrows()],
        "points": pts[["lat", "lon", "kind", "severity", "id"]].values.tolist(),
        "days": {"day": days.index.tolist(), **{k: days[k].tolist() for k in days.columns}},
        "top": top[["id", "kind", "start", "obj_type", "speed_start", "speed_min", "max_decel", "severity", "stop", "wagon"]]
        .to_dict("records"),
    }


# ---------- адрес для телефона (QR) ----------

@app.get("/api/lan")
def lan(port: int = 8000):
    import socket
    ips = set()
    try:
        ips |= {ai[4][0] for ai in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)}
    except OSError:
        pass
    rank = lambda ip: (0 if ip.startswith("192.168.") else 1 if ip.startswith("10.") else 2, ip)
    ips = sorted((ip for ip in ips if not ip.startswith("127.")), key=rank)
    public = os.environ.get("PUBLIC_URL")
    site_file = ROOT / "pitch" / "site_url.txt"   # тот же адрес туннеля, что в QR презентации
    if not public and site_file.exists():
        public = site_file.read_text(encoding="utf-8").strip() or None
    return {"urls": [f"http://{ip}:{port}/" for ip in ips], "public": public}


# ---------- видео с камер ----------

@app.get("/api/videos")
def videos():
    out = []
    for f in sorted(VIDEOS.glob("*.mp4")):
        out.append({"name": f.name, "size_mb": round(f.stat().st_size / 1e6, 1), "url": f"/api/videos/{f.name}"})
    return out


@app.get("/api/videos/{name}")
def video(name: str):
    f = (VIDEOS / name).resolve()
    if f.parent != VIDEOS.resolve() or not f.exists() or f.suffix != ".mp4":
        raise HTTPException(404)
    return FileResponse(f, media_type="video/mp4")


# ---------- загрузка своих данных с разбором в реальном времени ----------

JOBS: dict[str, dict] = {}


def _run_job(job_id: str, csv: Path, js: Path | None):
    job = JOBS[job_id]
    ev = job["events"]
    try:
        trip = f"upload-{job_id[:6]}_{csv.stem[:20]}"
        ev.append({"type": "stage", "stage": "parse_json" if js else "parse_csv", "t": time.time()})
        json_df = None
        if js:
            json_df = ingest_file(js, {})
            ev.append({"type": "progress", "stage": "parse_json", "rows": len(json_df)})
        ev.append({"type": "stage", "stage": "merge"})
        df = build(csv, json_df=json_df, trip=trip)
        df = df.sort_values("t", kind="stable").reset_index(drop=True)
        df.to_parquet(UPLOADS / f"{trip}.parquet", index=False)
        ev.append({"type": "progress", "stage": "merge", "rows": len(df),
                   "start": df.t.min().isoformat(), "end": df.t.max().isoformat()})
        groups = segment(df)
        ev.append({"type": "stage", "stage": "detect", "total": len(groups)})
        eps = []
        for n, (s, e) in enumerate(groups, 1):
            from dataclasses import asdict
            ep = asdict(build_episode(df, s, e, n))
            eps.append(ep)
            ev.append({"type": "episode", "i": n, "total": len(groups),
                       "episode": {k: ep.get(k) for k in SUMMARY_KEYS if k not in ("anomaly", "facts")}})
            time.sleep(0.004)  # чтобы поток событий был виден глазом на маленьких файлах
        eps = score(eps)
        summ = trip_summary(df, eps)
        with LOCK:
            for ep in eps:
                FACTS[ep["id"]] = json.dumps(ep.pop("facts"), ensure_ascii=False)
                EPISODES.append(ep)
                BY_ID[ep["id"]] = ep
            TRIP_LIST.append(summ)
        ev.append({"type": "done", "trip": trip, "summary": summ})
    except Exception as ex:  # noqa: BLE001
        ev.append({"type": "error", "message": f"{type(ex).__name__}: {ex}"})
    finally:
        job["finished"] = True


@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...)):
    UPLOADS.mkdir(parents=True, exist_ok=True)
    job_id = uuid.uuid4().hex
    folder = UPLOADS / job_id
    folder.mkdir()
    csv = js = None
    for f in files:
        name = Path(f.filename or "file").name
        dest = folder / name
        with open(dest, "wb") as out:
            while chunk := await f.read(1 << 20):
                out.write(chunk)
        if name.lower().endswith(".csv"):
            csv = dest
        elif name.lower().endswith((".jsonseq", ".json")):
            js = dest
    if csv is None:
        raise HTTPException(400, "Нужен CSV-файл move_detailed_*.csv (JSON-файл можно добавить к нему)")
    JOBS[job_id] = {"events": [], "finished": False}
    threading.Thread(target=_run_job, args=(job_id, csv, js), daemon=True).start()
    return {"job": job_id}


@app.get("/api/jobs/{job_id}/stream")
async def job_stream(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404)

    async def gen():
        i = 0
        while True:
            evs = job["events"]
            while i < len(evs):
                yield f"data: {json.dumps(evs[i], ensure_ascii=False)}\n\n"
                i += 1
            if job["finished"] and i >= len(job["events"]):
                break
            await asyncio.sleep(0.05)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ---------- ИИ-разбор через OpenRouter ----------

PROMPTS = {
    "ru": """Ты опытный аналитик бортовой системы помощи водителю трамвая (АБПВ). Пишешь коллеге, который откроет
эпизод через минуту и должен сразу понять, что произошло, и решить, что делать дальше.

Ниже проверенные факты одного эпизода из бортовых данных. У каждого факта есть время и поле-источник.

Напиши ответ строго в таком виде (заголовки как есть, обычный текст без markdown, без длинных тире):

Вывод: одно-два предложения простым языком: что увидела система, как отреагировала и чем закончилось
(остановился трамвай или нет, с какой скорости до какой). Это главное, пиши конкретно и с цифрами.

Что произошло: 1-3 предложения. Объясняй смысл, а не перечисляй признаки. Например, вместо
«goal_obj_type=Vehicle» пиши «система задавала скорость по автомобилю впереди (goal_obj_type)».

Как отреагировала система: 1-3 предложения в порядке времени: предупреждение, торможение, кто управлял.

Чем закончилось: 1-2 предложения.

Чего мы не знаем: 1-2 предложения о главных ограничениях данных для ЭТОГО эпизода.

Что проверить: 1-2 конкретных действия для аналитика (что открыть, на что посмотреть).

Правила: каждое утверждение о событии с меткой времени ЧЧ:ММ:СС; используй ТОЛЬКО приведённые факты;
не придумывай объекты, расстояния, тормоза и действия водителя; если причина не подтверждена полем, так и напиши;
goal_obj_type это объект, по которому система задавала скорость, а не доказанная близость к нему.
Поля указывай в скобках в конце фразы. Коротко: весь ответ до 170 слов.

Эпизод {id}, вагон {wagon}, тип: {kind}.
Факты:
{facts}""",
    "en": """You are an experienced analyst of a tram driver-assistance system (ADAS). You write for a colleague who will open
this episode in a minute and must immediately understand what happened and decide what to do next.

Below are verified facts of one episode from onboard data. Each fact has a time and a source field.

Answer strictly in this form (keep the headings, plain text, no markdown, no em dashes):

Conclusion: one or two plain sentences: what the system saw, how it responded and how it ended
(did the tram stop, from what speed to what). This is the key part: be concrete, use numbers.

What happened: 1-3 sentences. Explain the meaning instead of listing flags. For example, instead of
"goal_obj_type=Vehicle" write "the system set the target speed by a vehicle ahead (goal_obj_type)".

System response: 1-3 sentences in time order: warning, braking, who was in control.

Outcome: 1-2 sentences.

What we do not know: 1-2 sentences on the main data limits for THIS episode.

What to check: 1-2 concrete actions for the analyst (what to open, what to look at).

Rules: every statement about an event carries an HH:MM:SS timestamp; use ONLY the given facts; do not invent objects,
distances, brakes or driver actions; if no field confirms the cause, say so; goal_obj_type is the object the system
used to set speed, not proof that it was close. Put fields in parentheses at the end of a sentence. Keep it short:
under 170 words in total.

Episode {id}, wagon {wagon}, type: {kind}.
Facts:
{facts}""",
}
PROMPT_VERSION = "v2"  # новый промпт: свой кеш, старые ответы не подмешиваются
SEC = {"ru": {"circumstances": "Обстоятельства", "reaction": "Реакция", "result": "Результат", "limits": "Ограничения"},
       "en": {"circumstances": "Circumstances", "reaction": "Response", "result": "Outcome", "limits": "Limits"}}
DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash"


def _narr_path(eid: str, lang: str) -> Path:
    return NARR / (eid.replace("#", "~") + f".{PROMPT_VERSION}" + ("" if lang == "ru" else f".{lang}") + ".json")


def _cached_narrative(eid: str, lang: str = "ru"):
    f = _narr_path(eid, lang)
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


@app.get("/api/llm")
def llm_status():
    return {"enabled": bool(os.environ.get("OPENROUTER_API_KEY")), "model": os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)}


@app.post("/api/episodes/{eid}/narrative")
def narrative(eid: str, force: bool = False, lang: str = "ru"):
    lang = "en" if lang == "en" else "ru"
    e = BY_ID.get(eid.replace("~", "#"))
    if not e:
        raise HTTPException(404, "нет такого эпизода")
    if not force and (c := _cached_narrative(e["id"], lang)):
        return c
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise HTTPException(400, "OPENROUTER_API_KEY не задан в .env")
    model = os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
    txt = "text_en" if lang == "en" else "text"
    facts = "\n".join(f"[{SEC[lang][f['section']]}] {f['t'][11:19]} {f.get(txt) or f['text']} (field: {f['field']})"
                      for f in json.loads(FACTS[e["id"]]))
    r = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "X-Title": "GET tram episode analyzer"},
        json={"model": model, "temperature": 0.1, "max_tokens": 3000, "reasoning": {"enabled": False},
              "messages": [{"role": "user", "content": PROMPTS[lang].format(id=e["id"], wagon=e["wagon"], kind=e["kind"], facts=facts)}]},
        timeout=120,
    )
    if r.status_code != 200:
        raise HTTPException(502, f"OpenRouter: {r.status_code} {r.text[:300]}")
    msg = r.json()["choices"][0]
    text = msg["message"].get("content")
    if not text:
        raise HTTPException(502, f"OpenRouter вернул пустой ответ (finish_reason={msg.get('finish_reason')})")
    out = {"model": model, "text": text.replace("—", "-").replace("–", "-")}
    NARR.mkdir(parents=True, exist_ok=True)
    _narr_path(e["id"], lang).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


# ---------- Jev: лёгкая модель, ставит эпизод в очередь разбора и объясняет почему ----------

JEV_QUESTIONS = {
    "harm": "Был ли риск вреда людям (пешеходу, пассажирам, другим участникам)?",
    "false_alarm": "Похоже ли срабатывание на ложное (опасности не было)?",
    "review": "Нужен ли этому эпизоду ручной разбор специалистом?",
}
JEV_PROMPT = """Ты Jev, лёгкий помощник аналитика. Твоя задача: по фактам эпизода системы помощи водителю трамвая
решить, в какую очередь его ставить на ручной разбор, и коротко объяснить почему.

Как рассуждать:
- Риск вреда (harm) = yes только если есть экстренный, аварийный или рельсовый тормоз, или юз, или скорость упала
  больше чем на 15 км/ч с замедлением от 1.5 м/с². Тип объекта (goal_obj_type) сам по себе риск НЕ доказывает:
  в данных нет расстояния до объекта. Если тормозов нет и скорость почти не упала, harm = no.
- Ложное срабатывание (false_alarm) = yes, если торможение было, а объект не записан (Unknown) и скорость почти не
  изменилась или трамвай и так стоял; no, если объект записан и трамвай реально тормозил; иначе unknown.
- Ручной разбор (review) = yes, если harm = yes, или false_alarm = yes (это вопрос к калибровке), или есть юз;
  no для штатных случаев (светофор, плавное снижение без жёстких тормозов).
- priority: high, если harm = yes; medium, если review = yes; иначе low.
- summary: одно предложение-вывод для очереди по-русски, до 20 слов, с главной цифрой. Например:
  «Разобрать первым: рельсовый тормоз с 27 до 0 км/ч перед автомобилем.» или «Штатно: плавное снижение у светофора.»
- why: до 15 слов по-русски, конкретная причина ответа. unknown, если фактов не хватает. Не додумывай.

Верни только JSON:
{{"priority": "high|medium|low", "summary": "...", "harm": {{"a": "yes|no|unknown", "why": "..."}},
"false_alarm": {{"a": "...", "why": "..."}}, "review": {{"a": "...", "why": "..."}}}}

Эпизод: тип {kind}, скорость {v0}→{v1} км/ч, макс. замедление {dec} м/с², остановка: {stop}, тормоза: {brakes}.
Факты:
{facts}"""


@app.post("/api/episodes/{eid}/jev")
def jev(eid: str, run: bool = False):
    """Без run=true отдаём только кеш: платный вызов модели идёт по явной кнопке."""
    e = BY_ID.get(eid.replace("~", "#"))
    if not e:
        raise HTTPException(404)
    f = NARR / (e["id"].replace("#", "~") + f".jev.{PROMPT_VERSION}.json")
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    if not run:
        return {"model": None, "answers": None}
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise HTTPException(400, "OPENROUTER_API_KEY не задан")
    model = os.environ.get("JEV_MODEL", "qwen/qwen3.8-flash")
    facts = "\n".join(f"{x['t'][11:19]} {x['text']}" for x in json.loads(FACTS[e["id"]]))
    prompt = JEV_PROMPT.format(**JEV_QUESTIONS, kind=e["kind"], v0=e["speed_start"], v1=e["speed_min"], dec=e["max_decel"],
                               stop="да" if e["stopped"] else "нет", brakes=", ".join(e["hard_brakes"]) or "нет", facts=facts)
    r = httpx.post("https://openrouter.ai/api/v1/chat/completions",
                   headers={"Authorization": f"Bearer {key}"},
                   json={"model": model, "temperature": 0, "max_tokens": 500, "reasoning": {"enabled": False},
                         "response_format": {"type": "json_object"},
                         "messages": [{"role": "user", "content": prompt}]}, timeout=60)
    if r.status_code != 200:
        raise HTTPException(502, f"OpenRouter: {r.status_code} {r.text[:200]}")
    txt = r.json()["choices"][0]["message"].get("content") or "{}"
    try:
        ans = json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
    except ValueError:
        raise HTTPException(502, "модель вернула не JSON")
    out = {"model": model, "priority": ans.get("priority", "medium"), "summary": ans.get("summary", ""),
           "answers": {k: ans.get(k, {"a": "unknown", "why": ""}) for k in JEV_QUESTIONS}}
    NARR.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


# ---------- собранный фронтенд (для публичного адреса: один сервер на всё) ----------
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
