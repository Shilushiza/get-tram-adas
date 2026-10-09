import { create } from 'zustand'
import type { Episode, EpisodeSummary, Kind, Series, Trip } from './api'
import type { Lang } from './i18n'

export type Page = 'overview' | 'episode' | 'upload' | 'guide'
export type View = '3d' | '2d'

interface State {
  lang: Lang
  page: Page
  trips: Trip[]
  trip: string                // 'all' или id поездки
  episodes: EpisodeSummary[]
  kinds: Set<Kind>
  selected: Episode | null
  win: Series | null          // данные окна эпизода
  cursor: number | null       // единый временной курсор, мс
  playing: boolean
  rate: number
  view: View
  set: (p: Partial<State>) => void
}

const savedLang = (() => {
  try { return (localStorage.getItem('lang') as Lang) || 'ru' } catch { return 'ru' }
})()

export const useStore = create<State>((set) => ({
  lang: savedLang, page: 'overview', trips: [], trip: 'all', episodes: [],
  kinds: new Set<Kind>(['danger', 'traffic_light', 'hard_brake', 'skid']),
  selected: null, win: null, cursor: null, playing: false, rate: 2, view: '3d',
  set: (p) => {
    if (p.lang) try { localStorage.setItem('lang', p.lang) } catch { /* приватный режим */ }
    set(p)
  },
}))
