export type Kind = 'danger' | 'traffic_light' | 'hard_brake' | 'skid' | 'speed_limit'
export const KINDS: Kind[] = ['danger', 'traffic_light', 'hard_brake', 'skid', 'speed_limit']

export interface Trip {
  trip: string; wagon: string; rows: number; start: string; end: string
  routes: string[]; km: number; episodes: number; has_json: boolean
}

export interface Fact {
  t: string; section: 'circumstances' | 'reaction' | 'result' | 'limits'
  text: string; text_en?: string; field: string; value: string
}

export interface EpisodeSummary {
  id: string; trip: string; wagon: string; start: string; end: string; win_start: string; win_end: string
  kind: Kind; kinds: Kind[]; obj_type: string; route: string; stop: string; lat: number | null; lon: number | null
  speed_start: number; speed_min: number; speed_end: number; max_decel: number; warn_max: number
  reaction_s: number | null; stopped: boolean; controller: string; hard_brakes: string[]; skid: boolean
  severity: number; anomaly: number
}

export interface Episode extends EpisodeSummary { facts: Fact[]; narrative: Narrative | null }
export interface Narrative { model: string; text: string }

export type Series = { t: number[] } & Record<string, (number | string | null)[]>

export interface Stats {
  total: number; total_all: number; km: number; trips: number; wagons: string[]; critical: number
  per100km: number | null; assist_share: number; stopped_share: number; median_decel: number
  by_kind: Record<string, number>; by_obj: Record<string, number>; obj_unknown: number
  by_controller: Record<string, number>; by_severity: Record<string, number>
  hours: { hour: number[] } & Record<string, number[]>
  wagons_rate: { wagon: string; n: number; km: number; per100: number | null }[]
  speed_hist: { bins: string[]; n: number[] }
  stops: { stop: string; n: number; crit: number }[]
  points: [number, number, Kind, number, string][]
  days: { day: string[] } & Record<string, number[] | string[]>
  top: { id: string; kind: Kind; start: string; obj_type: string; speed_start: number; speed_min: number
    max_decel: number; severity: number; stop: string; wagon: string }[]
}

export interface Video { name: string; size_mb: number; url: string }

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) {
    let msg = `${r.status}`
    try { msg = (await r.json()).detail ?? msg } catch { /* ответ не JSON */ }
    throw new Error(msg)
  }
  return r.json()
}

const enc = (id: string) => encodeURIComponent(id.replace('#', '~'))

export const api = {
  trips: () => get<Trip[]>('/api/trips'),
  episodes: (trip: string) => get<EpisodeSummary[]>(`/api/episodes?trip=${encodeURIComponent(trip)}`),
  episode: (id: string, lang: string) => get<Episode>(`/api/episodes/${enc(id)}?lang=${lang}`),
  stats: (trip: string, kinds: Kind[]) => get<Stats>(`/api/stats?trip=${encodeURIComponent(trip)}&kinds=${kinds.join(',')}`),
  videos: () => get<Video[]>('/api/videos'),
  series: (trip: string, start?: string, end?: string, maxPoints = 4000) => {
    const q = new URLSearchParams({ trip, max_points: String(maxPoints) })
    if (start) q.set('start', start)
    if (end) q.set('end', end)
    return get<Series>(`/api/series?${q}`)
  },
  llm: () => get<{ enabled: boolean; model: string }>('/api/llm'),
  narrative: (id: string, lang: string, force = false) =>
    get<Narrative>(`/api/episodes/${enc(id)}/narrative?lang=${lang}${force ? '&force=true' : ''}`, { method: 'POST' }),
  upload: (files: File[]) => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    return get<{ job: string }>('/api/upload', { method: 'POST', body: fd })
  },
}

/* Палитра: одно место правды для цветов, которые рисуются кодом (ECharts, uPlot, canvas, 3D).
   Значения совпадают с токенами в index.css (:root). Категории событий только здесь (KIND_COLOR). */
export const PAL = {
  ink: '#13203a', ink2: '#4b5a70', ink3: '#6b778c',          // текст: основной, вторичный, подписи
  line: '#9fb0c6', line2: '#dbe3ee', panel: '#ffffff',         // рамки, сетка, поверхность
  brand: '#1d4fc4', inset: '#0e2240', onInset: '#b9c6da',      // бренд и «ночная Нева»
  muted: '#a8bcd4',                                            // контекстные столбцы (не категория)
  alarm: '#0B2E7A',                                            // важное и критичное
  amber: '#ffb020', amberLt: '#ffd166', amberInk: '#8a5a00',  // единственный тёплый акцент: «внимание» на тёмной сцене
  ok: '#0b7a5a', okDark: '#3df2a0',                            // итог «остановился до объекта»
}
export const KIND_COLOR: Record<Kind, string> = {
  danger: '#0B2E7A', traffic_light: '#2F7FE0', hard_brake: '#6A3FD0', skid: '#0FA3B8', speed_limit: '#A8BCD4',
}
/** Те же категории на тёмном фоне (2D-сцена, ролик): светлые версии, различимы по светлоте. */
export const KIND_GLOW: Record<Kind, string> = {
  danger: '#e3ebff', traffic_light: '#56b0ff', hard_brake: '#c4a8ff', skid: '#5fe3ef', speed_limit: '#c9d6ea',
}
/** Цвет с прозрачностью из hex: полосы на графиках и легенды берут категорию отсюда, а не копию rgba. */
export const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`
}
export const OBJ_COLOR: Record<string, string> = {
  Ped: KIND_COLOR.danger, Vehicle: KIND_COLOR.skid, Tram: KIND_COLOR.hard_brake, TrafficLightSignal: KIND_COLOR.traffic_light, Obstacle: PAL.ink3,
}
export const CTRL_COLOR: Record<string, string> = { driver: PAL.ink, auto: PAL.brand, und: '#c9d5e3' }

export const num = (s: Series | null, key: string, i: number): number | null => {
  const v = s?.[key]?.[i]
  return typeof v === 'number' ? v : null
}
export const str = (s: Series | null, key: string, i: number): string | null => {
  const v = s?.[key]?.[i]
  return v == null ? null : String(v)
}

/** Индекс последней точки с t <= x (бинарный поиск). */
export function indexAt(t: number[], x: number): number {
  let lo = 0, hi = t.length - 1
  if (hi < 0) return -1
  if (x <= t[0]) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (t[mid] <= x) lo = mid
    else hi = mid - 1
  }
  return lo
}

export const ms = (iso: string) => new Date(iso).getTime()
export const hms = (t: number) =>
  new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Moscow' })
export const dmy = (t: number) =>
  new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' })
