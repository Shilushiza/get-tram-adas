import { num, str, type Series } from './api'

/** Отрезок, когда в данных есть признак объекта или светофора, и где этот объект стоит на пути (м). */
export interface Anchor { from: number; to: number; at: number }

const condDist = (v: number) => Math.min(45, Math.max(12, (Math.min(v, 100) / 3.6) ** 2 / 2 + 8))

function runs(win: Series, flag: (i: number) => boolean) {
  const out: [number, number][] = []
  let s = -1
  for (let i = 0; i <= win.t.length; i++) {
    const on = i < win.t.length && flag(i)
    if (on && s < 0) s = i
    if (!on && s >= 0) { out.push([s, i - 1]); s = -1 }
  }
  return out
}

/**
 * Расстояния до объекта в данных нет, поэтому объект ставится условно, но один раз на отрезок:
 * впереди на тормозной путь от точки первого признака, и не ближе, чем трамвай доедет к концу отрезка.
 * Так объект неподвижен относительно улицы, а трамвай подъезжает к нему.
 */
export function computeAnchors(win: Series | null, dist: number[]) {
  if (!win || !dist.length) return { obj: [] as Anchor[], tl: [] as Anchor[] }
  const flag = (k: string, i: number) => (num(win, k, i) ?? 0) > 0.5
  const objFlag = (i: number) => flag('danger_act', i) || flag('danger_real', i)
    || ['Ped', 'Vehicle', 'Tram', 'Obstacle'].includes(str(win, 'goal_obj_type', i) ?? '')
  const tlFlag = (i: number) => flag('tl_act', i) || flag('tl_real', i) || str(win, 'goal_obj_type', i) === 'TrafficLightSignal'
  const mk = ([a, b]: [number, number]): Anchor => ({
    from: a, to: b, at: Math.max(dist[a] + condDist(num(win, 'speed', a) ?? 0), dist[b] + 6),
  })
  return { obj: runs(win, objFlag).map(mk), tl: runs(win, tlFlag).map(mk) }
}

/** Якорь, активный в точке i (с допуском в одну запись). */
export function activeAnchor(list: Anchor[], i: number) {
  return list.find((a) => i >= a.from - 1 && i <= a.to + 1) ?? null
}
