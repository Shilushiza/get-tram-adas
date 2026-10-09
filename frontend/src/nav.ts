import { api, ms } from './api'
import { useStore } from './store'

const PAD = 20_000 // мс контекста вокруг окна эпизода

/** Открыть эпизод: карточка, данные окна, курсор на начало окна. */
export async function openEpisode(id: string) {
  const { set, lang, episodes } = useStore.getState()
  set({ playing: false, page: 'episode' })
  window.scrollTo({ top: 0 })
  const ep = await api.episode(id, lang)
  const from = new Date(ms(ep.win_start) - PAD).toISOString()
  const to = new Date(ms(ep.win_end) + PAD).toISOString()
  const win = await api.series(ep.trip, from, to)
  if (!episodes.length || episodes[0].trip !== ep.trip) {
    api.episodes(ep.trip).then((list) => useStore.getState().set({ episodes: list }))
  }
  set({ selected: ep, win, cursor: ms(ep.win_start) })
}
