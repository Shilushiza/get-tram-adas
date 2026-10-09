import type { Stats } from './api'
import type { Lang } from './i18n'
import { place } from './i18n'

const KIND = {
  ru: { danger: 'препятствия', traffic_light: 'светофоры', hard_brake: 'экстренные торможения', skid: 'юз', speed_limit: 'ограничения скорости' },
  en: { danger: 'obstacles', traffic_light: 'traffic lights', hard_brake: 'emergency braking', skid: 'wheel slip', speed_limit: 'speed limits' },
} as const
const OBJ = {
  ru: { Ped: 'пешеходы', Vehicle: 'автомобили', Tram: 'трамваи', TrafficLightSignal: 'светофоры', Obstacle: 'препятствия' },
  en: { Ped: 'pedestrians', Vehicle: 'cars', Tram: 'trams', TrafficLightSignal: 'traffic lights', Obstacle: 'obstacles' },
} as Record<Lang, Record<string, string>>

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]

/** Однострочные выводы под графиками: что видно и что с этим делать. */
export function insights(s: Stats, lang: Lang) {
  const ru = lang === 'ru'
  const [k1, n1] = top(s.by_kind) ?? ['danger', 0]
  const hourTotals = s.hours.hour.map((h) => Object.entries(s.hours).filter(([k]) => k !== 'hour').reduce((a, [, v]) => a + ((v as number[])[h] ?? 0), 0))
  const peak = hourTotals.indexOf(Math.max(...hourTotals))
  const night = hourTotals.slice(0, 5).reduce((a, b) => a + b, 0)
  const w = [...s.wagons_rate].filter((x) => x.per100 != null).sort((a, b) => (b.per100 ?? 0) - (a.per100 ?? 0))
  const [o1, on] = top(s.by_obj) ?? ['Vehicle', 0]
  const known = Object.values(s.by_obj).reduce((a, b) => a + b, 0)
  const auto = s.by_controller.auto ?? 0
  const sp = s.speed_hist.n.indexOf(Math.max(...s.speed_hist.n))
  const st = s.stops[0]
  const ratio = w.length > 1 ? (w[0].per100! / Math.max(w[w.length - 1].per100!, 1)).toLocaleString(ru ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 }) : ''
  const slow = /^0\D/.test(s.speed_hist.bins[sp] ?? '')
  return {
    kinds: ru
      ? `Чаще всего система реагирует на ${KIND.ru[k1 as keyof typeof KIND.ru]}: ${pct(n1, s.total)}% всех срабатываний.`
      : `The system reacts most often to ${KIND.en[k1 as keyof typeof KIND.en]}: ${pct(n1, s.total)}% of all episodes.`,
    hours: ru
      ? `Пик в ${String(peak).padStart(2, '0')}:00, ночью (0-5 ч) почти тихо: ${night} шт. Разбор начинайте с часа пик.`
      : `Peak at ${String(peak).padStart(2, '0')}:00; nights (0-5 h) are quiet: ${night}. Start reviews with the rush hour.`,
    map: ru
      ? `Крупные точки это важные срабатывания. Кликните точку, чтобы открыть эпизод.`
      : `Large dots are important episodes. Click a dot to open the episode.`,
    objects: ru
      ? `Из тех, где объект записан, чаще всего это ${OBJ.ru[o1] ?? o1} (${pct(on, known)}%). У ${pct(s.obj_unknown, s.obj_unknown + known)}% эпизодов тип объекта не записан.`
      : `Where the object is recorded, it is mostly ${OBJ.en[o1] ?? o1} (${pct(on, known)}%). ${pct(s.obj_unknown, s.obj_unknown + known)}% of episodes have no object type.`,
    wagons: w.length > 1
      ? ru
        ? `Вагон № ${w[0].wagon} срабатывает в ${ratio} раза чаще, чем № ${w[w.length - 1].wagon}, на тот же пробег. Причину стоит проверить: калибровка или маршрут.`
        : `Wagon ${w[0].wagon} triggers ${ratio}× as often as ${w[w.length - 1].wagon} per km. Worth checking why: calibration or route.`
      : '',
    control: ru
      ? `В ${pct(auto, s.total)}% срабатываний трамвай вёл ассистент, в остальных водитель.`
      : `The assistant was driving in ${pct(auto, s.total)}% of episodes, the driver in the rest.`,
    speed: ru
      ? `Чаще всего система срабатывает на скорости ${s.speed_hist.bins[sp]} км/ч${slow ? ', то есть когда трамвай почти стоит или трогается.' : '.'}`
      : `Most episodes happen at ${s.speed_hist.bins[sp]} km/h${slow ? ', when the tram is nearly stopped or pulling away.' : '.'}`,
    stops: st
      ? ru
        ? `Лидер: «${st.stop}», ${st.n} срабатываний, из них ${st.crit} важных. Тёмно-синяя часть это важные.`
        : `Top: “${place(st.stop, lang)}”, ${st.n} episodes, ${st.crit} important. Dark blue marks important ones.`
      : '',
    top: ru
      ? `Сверху важные эпизоды, среди них первыми необычные для своего типа. Полоса справа показывает пиковое замедление.`
      : `Important episodes first, and among them the unusual ones for their type. The bar on the right shows peak deceleration.`,
  }
}
