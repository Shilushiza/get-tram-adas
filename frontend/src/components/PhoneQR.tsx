import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useT } from '../i18n'

/** Публичная ссылка на сайт: на внешнем адресе это он сам, локально берём из /api/lan. */
export function useSiteUrl() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)
    if (!local) { setUrl(location.origin + '/'); return }
    fetch('/api/lan').then((r) => r.json()).then((d) => setUrl(d.public ? d.public.replace(/\/?$/, '/') : null)).catch(() => setUrl(null))
  }, [])
  return url
}

/** Небольшой QR в шапке обзора: открыть этот сайт с телефона. */
export function SiteQR() {
  const { lang } = useT()
  const url = useSiteUrl()
  const [img, setImg] = useState<string | null>(null)
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 168, color: { dark: '#0e2240', light: '#FFFFFF' } }).then(setImg)
  }, [url])
  if (!url || !img) return null
  return (
    <a className="site-qr" href={url} target="_blank" rel="noreferrer" title={url}>
      <img src={img} alt="QR" width={84} height={84} />
      <span>{lang === 'ru' ? 'Открыть с телефона' : 'Open on your phone'}<small>{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</small></span>
    </a>
  )
}

/** Кнопка «Открыть на телефоне»: QR с адресом в локальной сети или публичным адресом. */
export default function PhoneQR() {
  const { lang } = useT()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [img, setImg] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const local = ['localhost', '127.0.0.1'].includes(location.hostname)
    const pick = (u: string) => { setUrl(u); QRCode.toDataURL(u, { margin: 1, width: 240, color: { dark: '#17202B', light: '#FFFFFF' } }).then(setImg) }
    if (!local) { pick(location.origin + '/'); return }
    fetch('/api/lan').then((r) => r.json()).then((d) => pick(d.public || d.urls?.[0] || location.origin))
  }, [open])

  return (
    <>
      <button className="phone-btn" onClick={() => setOpen(true)} aria-label={lang === 'ru' ? 'Открыть на телефоне' : 'Open on phone'}>
        <svg viewBox="0 0 24 24" aria-hidden><rect x="6" y="2" width="12" height="20" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="18" r="1.1" fill="currentColor" /></svg>
        <span>{lang === 'ru' ? 'На телефоне' : 'On phone'}</span>
      </button>
      {open && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setOpen(false)} aria-label="close">×</button>
            <b>{lang === 'ru' ? 'Наведите камеру телефона' : 'Point your phone camera'}</b>
            {img ? <img src={img} alt="QR" width={240} height={240} /> : <div className="qr-wait" />}
            <code>{url}</code>
            <p className="hint">{url?.startsWith('https://')
              ? (lang === 'ru' ? 'Ссылка открывается из любой сети.' : 'The link works from any network.')
              : (lang === 'ru' ? 'Телефон должен быть в той же Wi-Fi сети, что и этот компьютер.' : 'The phone must be on the same Wi-Fi network as this computer.')}</p>
          </div>
        </div>
      )}
    </>
  )
}
