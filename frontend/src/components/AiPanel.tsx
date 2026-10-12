import { useEffect, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'
import '@fontsource/pt-serif/cyrillic-400.css'
import '@fontsource/pt-serif/cyrillic-700.css'
import './ai.css'

type A = { a: 'yes' | 'no' | 'unknown'; why: string }
type Jev = { model: string | null; priority?: 'high' | 'medium' | 'low'; summary?: string; answers: Record<string, A> | null }

const Q = {
  harm: { ru: 'Был риск вреда людям?', en: 'Risk of harm to people?' },
  false_alarm: { ru: 'Похоже на ложное срабатывание?', en: 'Looks like a false alarm?' },
  review: { ru: 'Нужен ручной разбор?', en: 'Needs manual review?' },
} as const
const ANS = { yes: { ru: 'да', en: 'yes' }, no: { ru: 'нет', en: 'no' }, unknown: { ru: 'не знаю', en: 'unsure' } }
const PRIO = {
  high: { ru: 'Разобрать первым', en: 'Review first' },
  medium: { ru: 'Разобрать в очереди', en: 'Review in queue' },
  low: { ru: 'Можно не разбирать', en: 'Can skip' },
}
// заголовки ответа модели (промпт v2): по ним режем текст на блоки
const HEADS = ['Вывод', 'Что произошло', 'Как отреагировала система', 'Чем закончилось', 'Чего мы не знаем', 'Что проверить',
  'Conclusion', 'What happened', 'System response', 'Outcome', 'What we do not know', 'What to check']

/** Понятная причина вместо сырого ответа провайдера. */
export function llmError(raw: string, lang: 'ru' | 'en') {
  if (/429|rate.?limit/i.test(raw)) return lang === 'ru' ? 'Модель сейчас перегружена запросами. Повторите через минуту.' : 'The model is rate-limited right now. Retry in a minute.'
  if (/OPENROUTER|key|401|403/i.test(raw)) return lang === 'ru' ? 'Модель не подключена: нет ключа доступа.' : 'The model is not connected: no access key.'
  return lang === 'ru' ? 'Модель не ответила. Повторите попытку.' : 'The model did not respond. Try again.'
}

function post<T>(url: string) {
  return fetch(url, { method: 'POST' }).then(async (r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject((await r.json()).detail)))
}

function parse(text: string) {
  const re = new RegExp(`^\\s*(?:#+\\s*)?\\**(${HEADS.join('|')})\\**\\s*:?\\s*`, 'i')
  const out: { head: string; body: string }[] = []
  for (const line of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(re)
    if (m) out.push({ head: m[1], body: line.slice(m[0].length) })
    else if (out.length) out[out.length - 1].body += ' ' + line
    else out.push({ head: '', body: line })
  }
  return out
}

/** Текст модели: первая буква заглавная, имена полей в скобках набраны мелко и серым. */
function rich(text: string) {
  const s = text.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase())
  return s.split(/(\([a-z][a-z0-9_]*(?:,\s*[a-z][a-z0-9_]*)*\))/g).map((part, i) =>
    i % 2 ? <span key={i} className="ai-field">{part}</span> : part)
}

function JevBlock() {
  const { selected, lang } = useStore()
  const [d, setD] = useState<Jev | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const id = selected ? encodeURIComponent(selected.id.replace('#', '~')) : ''
  const ask = (run: boolean) => {
    if (!selected) return
    setErr(null); if (run) setBusy(true)
    post<Jev>(`/api/episodes/${id}/jev${run ? '?run=true' : ''}`).then(setD).catch((e) => setErr(String(e))).finally(() => setBusy(false))
  }
  // Jev дешёвый: при открытии окна сразу спрашиваем (сервер сначала отдаёт кеш, модель зовёт только если ответа нет)
  useEffect(() => { setD(null); ask(true) }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const has = !!d?.answers
  return (
    <section className="ai-card">
      <header>
        <h3>Jev</h3>
        <span>{lang === 'ru' ? 'ставит эпизод в очередь разбора и объясняет почему' : 'queues the episode for review and says why'}</span>
      </header>
      {has && d?.priority && (
        <div className={`jev-verdict p-${d.priority}`}>
          <b>{PRIO[d.priority][lang]}</b>
          {d.summary && <p className="ai-text">{rich(d.summary.replace(/^(Разобрать первым|Разобрать в очереди|Можно не разбирать|Review first|Review in queue|Can skip)\s*:\s*/i, ''))}</p>}
        </div>
      )}
      {has && (
        <dl className="jev-qs">
          {(Object.keys(Q) as (keyof typeof Q)[]).map((k) => {
            const a = d!.answers![k]
            return (
              <div key={k}>
                <dt>{Q[k][lang]}</dt>
                <dd><b className={`ans a-${a?.a ?? 'unknown'}`}>{ANS[a?.a ?? 'unknown'][lang]}</b> {a?.why ? rich(a.why) : null}</dd>
              </div>
            )
          })}
        </dl>
      )}
      {!has && busy && <p className="hint"><span className="spinner dark" /> {lang === 'ru' ? 'Jev читает факты эпизода…' : 'Jev is reading the facts…'}</p>}
      {!has && !busy && !err && <p className="hint">{lang === 'ru' ? 'Сохранённого ответа Jev для этого эпизода нет. Живые вызовы ИИ выключены.' : 'No saved Jev answer for this episode. Live AI calls are off.'}</p>}
      {!has && !busy && err && (
        <button className="btn primary" onClick={() => ask(true)}>{lang === 'ru' ? 'Спросить Jev ещё раз' : 'Ask Jev again'}</button>
      )}
      {has && d?.model && <small className="ai-model">{d.model}</small>}
      {err && <p className="ai-err" role="alert">{llmError(err, lang)}</p>}
    </section>
  )
}

function ReviewBlock() {
  const { selected, lang } = useStore()
  const { t } = useT()
  const [text, setText] = useState<string | null>(null)
  const [model, setModel] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  useEffect(() => { api.llm().then((d) => setLive(d.enabled)).catch(() => setLive(false)) }, [])
  useEffect(() => {
    setErr(null); setText(null)
    if (!selected) return
    api.episode(selected.id, lang).then((e) => { setText(e.narrative?.text ?? null); setModel(e.narrative?.model) })
  }, [selected?.id, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    if (!selected) return
    setBusy(true); setErr(null)
    try { const r = await api.narrative(selected.id, lang, !!text); setText(r.text); setModel(r.model) }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const blocks = text ? parse(text.replace(/\*\*/g, '')) : []
  return (
    <section className="ai-card">
      <header>
        <h3>{t('aiTitle')}</h3>
        <span>{lang === 'ru' ? 'пересказывает проверенные факты, новых не добавляет' : 'retells verified facts, adds nothing new'}</span>
      </header>
      {blocks.length > 0 ? (
        <div className="ai-review">
          {blocks.map((b, k) => (
            <div key={k} className={k === 0 ? 'lead' : ''}>
              {b.head && <h4>{b.head}</h4>}
              <p className="ai-text">{rich(b.body)}</p>
            </div>
          ))}
          <small className="ai-model">{t('aiModel')} {model}</small>
        </div>
      ) : <p className="hint">{live ? t('aiHint') : (lang === 'ru' ? 'Сохранённого разбора для этого эпизода нет. Живые вызовы ИИ выключены.' : 'No saved review for this episode. Live AI calls are off.')}</p>}
      {live && (
        <button className="btn" disabled={busy} onClick={run}>
          {busy ? <span className="spinner dark" /> : null}{busy ? t('aiBusy') : text ? t('aiRerun') : t('aiRun')}
        </button>
      )}
      {err && <p className="ai-err" role="alert">{llmError(err, lang)}</p>}
    </section>
  )
}

function Spark() {
  return (
    <svg className="spark" viewBox="0 0 20 20" aria-hidden>
      <path d="M10 1.5 11.9 8.1 18.5 10 11.9 11.9 10 18.5 8.1 11.9 1.5 10 8.1 8.1Z" fill="currentColor" />
      <path d="M16 1.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill="currentColor" opacity=".75" />
    </svg>
  )
}

/** Полоса-приглашение под цифрами эпизода: чтобы окно ИИ-анализа нельзя было не заметить. */
export function AiBanner() {
  const { selected, lang } = useStore()
  if (!selected) return null
  const ru = lang === 'ru'
  return (
    <button className="ai-banner" onClick={() => window.dispatchEvent(new Event('ai:open'))}>
      <Spark />
      <span className="ai-banner-t">
        <b>{ru ? 'Что сказал ИИ об этом эпизоде' : 'What the AI says about this episode'}</b>
        <span>{ru ? 'Вывод в двух предложениях, приоритет разбора от Jev и что проверить. Модель пересказывает только факты из данных.'
          : 'A two-sentence conclusion, review priority from Jev and what to check. The model retells only facts from the data.'}</span>
      </span>
      <span className="ai-banner-go">{ru ? 'Открыть ИИ-анализ' : 'Open AI analysis'}</span>
    </button>
  )
}

/** Кнопка в шапке эпизода и выезжающее окно «ИИ-анализ»: Jev (очередь) и связный разбор. */
export default function AiPanel() {
  const { selected, lang } = useStore()
  const [open, setOpen] = useState(false)
  // открыть окно можно и из полосы-приглашения на странице эпизода (AiBanner)
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('ai:open', onOpen)
    return () => window.removeEventListener('ai:open', onOpen)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!selected) return null
  return (
    <>
      <button className="btn primary ai-open" onClick={() => setOpen(true)}>
        <Spark />{lang === 'ru' ? 'ИИ-анализ эпизода' : 'AI analysis'}
      </button>
      {open && (
        <div className="ai-shade" onClick={() => setOpen(false)}>
          <aside className="ai-drawer" role="dialog" aria-modal="true" aria-label={lang === 'ru' ? 'ИИ-анализ эпизода' : 'AI analysis'}
            onClick={(e) => e.stopPropagation()}>
            <header className="ai-drawer-h">
              <div>
                <h2>{lang === 'ru' ? 'ИИ-анализ эпизода' : 'AI analysis'}</h2>
                <p>{lang === 'ru'
                  ? 'Модели через OpenRouter читают только проверенные факты ниже. Если текст расходится с фактами, верьте фактам.'
                  : 'Models via OpenRouter read only the verified facts. If the text disagrees with the facts, trust the facts.'}</p>
              </div>
              <button className="x" onClick={() => setOpen(false)} aria-label={lang === 'ru' ? 'Закрыть' : 'Close'}>×</button>
            </header>
            <JevBlock />
            <ReviewBlock />
          </aside>
        </div>
      )}
    </>
  )
}
