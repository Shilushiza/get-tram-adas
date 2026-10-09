import { useEffect, useState } from 'react'
import { useStore } from '../store'

type A = { a: 'yes' | 'no' | 'unknown'; why: string }
const Q = {
  harm: { ru: 'Был риск вреда людям?', en: 'Risk of harm to people?' },
  false_alarm: { ru: 'Похоже на ложное срабатывание?', en: 'Looks like a false alarm?' },
  review: { ru: 'Нужен ручной разбор?', en: 'Needs manual review?' },
} as const
/** Понятная причина вместо сырого ответа провайдера. */
export function llmError(raw: string, lang: 'ru' | 'en') {
  const busy = /429|rate.?limit/i.test(raw)
  const off = /OPENROUTER|key|401|403/i.test(raw)
  if (busy) return lang === 'ru' ? 'Модель сейчас перегружена запросами. Повторите через минуту.' : 'The model is rate-limited right now. Retry in a minute.'
  if (off) return lang === 'ru' ? 'Модель не подключена: нет ключа доступа.' : 'The model is not connected: no access key.'
  return lang === 'ru' ? 'Модель не ответила. Повторите попытку.' : 'The model did not respond. Try again.'
}
const L = { yes: { ru: 'да', en: 'yes' }, no: { ru: 'нет', en: 'no' }, unknown: { ru: 'не знаю', en: 'unsure' } }

/** Джеф: лёгкая модель отвечает да / нет / не знаю на три вопроса о вреде. */
export default function JevVerdicts() {
  const { selected, lang } = useStore()
  const [ans, setAns] = useState<Record<string, A> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ask = (run: boolean) => {
    if (!selected) return
    setErr(null); if (run) setBusy(true)
    fetch(`/api/episodes/${encodeURIComponent(selected.id.replace('#', '~'))}/jev${run ? '?run=true' : ''}`, { method: 'POST' })
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json()).detail)))
      .then((d) => setAns(d.answers)).catch((e) => setErr(String(e))).finally(() => setBusy(false))
  }
  // при открытии эпизода только кеш: вызов модели платный и идёт по кнопке
  useEffect(() => { setAns(null); ask(false) }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="jev">
      <h3>{lang === 'ru' ? 'Быстрые вердикты (Джеф)' : 'Quick verdicts (Jev)'}</h3>
      {(Object.keys(Q) as (keyof typeof Q)[]).map((k) => {
        const a = ans?.[k]
        return (
          <div className="jev-row" key={k}>
            <span>{Q[k][lang]}</span>
            <b className={`verdict v-${a?.a ?? 'na'}`}>{a ? L[a.a]?.[lang] ?? a.a : '-'}</b>
            {a?.why && <small>{a.why}</small>}
          </div>
        )
      })}
      {!ans && (
        <button className="btn" disabled={busy} onClick={() => ask(true)}>
          {busy ? <span className="spinner" /> : null}{lang === 'ru' ? 'Спросить Джефа' : 'Ask Jev'}
        </button>
      )}
      {err && <div className="llm-err" role="status"><p>{llmError(err, lang)}</p></div>}
    </section>
  )
}
