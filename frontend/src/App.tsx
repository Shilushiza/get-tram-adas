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
  // «Витязь-М» в петербургском синем: три секции, наклонный лоб с чёрной маской и табло,
  // однорычажный пантограф у контактного провода. Геометрия совпадает с launcher/make_icon.py.
  const glass = '#0B1730'
  return (
    <svg className="logo" viewBox="0 0 64 32" aria-hidden>
      <path d="M1 3.5h62" stroke="currentColor" strokeWidth="1" />
      <path d="M44 11.4 48.6 7.6 43.6 4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <path d="M40.6 4h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M42.5 11.5h4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 24.5V14q0-2.5 2.5-2.5H51c4 0 6.6 1.1 8.6 4.1l2.6 4.8q.6 1.2.4 2.4l-.3 1.7z" fill="#2F6FE4" />
      <path d="M3 21.6h59.75l-.15 1.2-.3 1.7H3z" fill="#DDE7F5" />
      <path d="M3 20.6h50.5" stroke="#fff" strokeWidth=".7" />
      <rect x="5" y="14" width="14" height="5.2" rx=".8" fill={glass} />
      <rect x="23.4" y="14" width="12.8" height="5.2" rx=".8" fill={glass} />
      <rect x="40.4" y="14" width="11.4" height="5.2" rx=".8" fill={glass} />
      <path d="M9.6 13.2h3v8.4h-3zM28.2 13.2h3v8.4h-3zM44.4 13.2h3v8.4h-3z" fill="#8FB6F2" />
      <path d="M11.1 14v7M29.7 14v7M45.9 14v7" stroke={glass} strokeWidth=".5" />
      <rect x="20.6" y="11.5" width="1.4" height="13" fill={glass} />
      <rect x="37.6" y="11.5" width="1.4" height="13" fill={glass} />
      <path d="M52.4 12.4h1.6c2.6 0 4.2 1 5.4 3l2.6 4.9h-8.2q-1.4 0-1.4-1.4z" fill={glass} />
      <rect x="53.4" y="13.2" width="4" height="1.3" rx=".3" fill="#FFB020" />
      <circle cx="61.2" cy="22.6" r=".75" fill="#fff" />
      <path d="M6 24.5h8v1.8H6zM26 24.5h7v1.8h-7zM50 24.5h8v1.8h-8z" fill={glass} />
      <path d="M1 27.5h62" stroke="currentColor" strokeWidth="1" />
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
