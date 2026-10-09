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

export const KIND_COLOR: Record<Kind, string> = {
  danger: '#D55E00', traffic_light: '#B07A00', hard_brake: '#B4447F', skid: '#009E73', speed_limit: '#8A939F',
}
export const OBJ_COLOR: Record<string, string> = {
  Ped: '#D55E00', Vehicle: '#0072B2', Tram: '#B4447F', TrafficLightSignal: '#B07A00', Obstacle: '#556170',
}
export const CTRL_COLOR: Record<string, string> = { driver: '#17202B', auto: '#0072B2', und: '#C5CCD4' }

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
