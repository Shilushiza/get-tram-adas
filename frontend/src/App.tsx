import { useEffect } from 'react'
import { api, dmy, ms } from './api'
import { useStore, type Page } from './store'
import { useT, type Key } from './i18n'
import Overview from './pages/Overview'
import Episode from './pages/Episode'
import Upload from './pages/Upload'
import Guide from './pages/Guide'
import PhoneQR from './components/PhoneQR'
import { openEpisode } from './nav'

function Logo() {
  // силуэт трамвая с пантографом у контактного провода
  return (
    <svg className="logo" viewBox="0 0 64 32" aria-hidden>
      <path d="M2 4h60" stroke="currentColor" strokeWidth="1.4" />
      <path d="M30 13 36 8 31 4.6" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <rect x="6" y="13" width="52" height="12" rx="3" fill="#D55E00" />
      <rect x="9" y="15.5" width="40" height="4" rx="1" fill="#1C232D" />
      <path d="M52 15.5h4.5l-1 4H52z" fill="#1C232D" />
      <circle cx="15" cy="27" r="2.2" fill="currentColor" /><circle cx="22" cy="27" r="2.2" fill="currentColor" />
      <circle cx="44" cy="27" r="2.2" fill="currentColor" /><circle cx="51" cy="27" r="2.2" fill="currentColor" />
      <path d="M2 30h60" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export default function App() {
  const { page, trips, trip, lang, selected, set } = useStore()
  const { t } = useT()

  useEffect(() => { api.trips().then((trips) => set({ trips })) }, [set])
  // прямые ссылки: #ep=<id>, #upload, #en
  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1))
    if (h.includes('en')) set({ lang: 'en' })
    const m = h.match(/ep=([^&]+)/)
    if (m) openEpisode(m[1])
    else if (h.includes('upload')) set({ page: 'upload' })
    else if (h.includes('guide')) set({ page: 'guide' })
  }, [set])
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // клавиатура для разбора: пробел, стрелки
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (s.page !== 'episode' || !s.win || (e.target as HTMLElement).closest('input, textarea, select, button')) return
      if (e.code === 'Space') { e.preventDefault(); s.set({ playing: !s.playing }) }
      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        const d = (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5000 : 1000)
        const t0 = s.win.t[0], t1 = s.win.t[s.win.t.length - 1]
        s.set({ cursor: Math.min(t1, Math.max(t0, (s.cursor ?? t0) + d)), playing: false })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tabs: [Page, Key][] = [['overview', 'navOverview'], ['episode', 'navEpisode'], ['upload', 'navUpload'], ['guide', 'navGuide']]

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <Logo />
          <div>
            <b>{t('appTitle')}</b>
            <span>{t('appSub')}</span>
          </div>
        </div>
        <nav className="tabs-top">
          {tabs.map(([p, k]) => (
            <button key={p} aria-current={page === p} disabled={p === 'episode' && !selected} onClick={() => set({ page: p })}>
              {t(k)}
            </button>
          ))}
        </nav>
        <span className="grow" />
        {page === 'overview' && (
          <select value={trip} onChange={(e) => set({ trip: e.target.value })} aria-label={t('wagon')}>
            <option value="all">{t('allTrips')}</option>
            {trips.map((x) => (
              <option key={x.trip} value={x.trip}>
                {x.trip.startsWith('upload') ? `↑ ${x.trip.split('_').slice(1).join('_')}` : `${t('wagon')} ${x.wagon}, ${dmy(ms(x.start))}`}
              </option>
            ))}
          </select>
        )}
        <PhoneQR />
        <div className="lang" role="group" aria-label="Language">
          {(['ru', 'en'] as const).map((l) => (
            <button key={l} aria-pressed={lang === l} onClick={() => set({ lang: l })}>{l.toUpperCase()}</button>
          ))}
        </div>
      </header>
      <main>
        {page === 'overview' && <Overview />}
        {page === 'episode' && <Episode />}
        {page === 'upload' && <Upload />}
        {page === 'guide' && <Guide />}
      </main>
    </div>
  )
}
