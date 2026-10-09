import { num, str, type Series } from './api'

/** Отрезок с признаком объекта или светофора, точка на пути (м) и чем закончилось.
 *  stopped: трамвай остановился, пока признак держался; gap: сколько метров не доехал до объекта (условно). */
export interface Anchor { from: number; to: number; at: number; outcome: 'stopped' | 'passed'; stopIdx: number | null; gap: number }

const STOP_V = 0.5      // км/ч: ниже считаем остановкой
const STOP_GAP = 6      // м: где стоит объект относительно точки остановки носа (условно, дистанции в данных нет)
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
 * Расстояния до объекта в данных нет, поэтому объект ставится условно, но один раз на отрезок и стоит на улице.
 * Если трамвай остановился (пока признак держался или сразу после), объект ставится на STOP_GAP метров впереди
 * точки остановки: так видно «остановился до объекта». Если не остановился, объект впереди на тормозной путь
 * и пропадает, когда признак снят: «проехал, сигнал снят». Наезд в данных не регистрируется и не рисуется.
 */
export function computeAnchors(win: Series | null, dist: number[]) {
  if (!win || !dist.length) return { obj: [] as Anchor[], tl: [] as Anchor[] }
  const flag = (k: string, i: number) => (num(win, k, i) ?? 0) > 0.5
  const objFlag = (i: number) => flag('danger_act', i) || flag('danger_real', i)
    || ['Ped', 'Vehicle', 'Tram', 'Obstacle'].includes(str(win, 'goal_obj_type', i) ?? '')
  const tlFlag = (i: number) => flag('tl_act', i) || flag('tl_real', i) || str(win, 'goal_obj_type', i) === 'TrafficLightSignal'
  const speed = (i: number) => num(win, 'speed', i) ?? 0
  const mk = ([a, b]: [number, number]): Anchor => {
    // остановка в отрезке или в 3 записях после него
    let stopIdx: number | null = null
    for (let i = a; i <= Math.min(win.t.length - 1, b + 3); i++) if (speed(i) < STOP_V && i > a) { stopIdx = i; break }
    if (speed(a) < STOP_V) stopIdx = null  // стоял с самого начала: это не торможение перед объектом
    const at = stopIdx != null
      ? dist[stopIdx] + STOP_GAP
      : Math.max(dist[a] + condDist(speed(a)), dist[b] + 6)
    return { from: a, to: b, at, outcome: stopIdx != null ? 'stopped' : 'passed', stopIdx, gap: STOP_GAP }
  }
  return { obj: runs(win, objFlag).map(mk), tl: runs(win, tlFlag).map(mk) }
}

/** Якорь, активный в точке i: от первого признака до конца признака, а при остановке до конца окна. */
export function activeAnchor(list: Anchor[], i: number) {
  return list.find((a) => i >= a.from - 1 && (i <= a.to + 1 || (a.outcome === 'stopped' && a.stopIdx != null && i >= a.stopIdx))) ?? null
}
