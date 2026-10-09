import { useEffect, useState } from 'react'
import { api, type Video } from '../api'
import { useT } from '../i18n'

const LABEL: Record<string, { ru: string; en: string }> = {
  '20641837288063.mp4': { ru: 'Левая камера + телеметрия', en: 'Left camera + telemetry' },
  '20641838336639.mp4': { ru: 'Визуализатор: две камеры и 3D-сцена', en: 'Visualiser: two cameras and 3D scene' },
  '7467005839873.mp4': { ru: 'Передняя камера с разметкой объектов', en: 'Front camera with object boxes' },
}

export default function VideoPanel() {
  const { lang } = useT()
  const [list, setList] = useState<Video[]>([])
  const [cur, setCur] = useState(0)
  useEffect(() => { api.videos().then(setList) }, [])
  if (!list.length) return <div className="empty">…</div>
  const v = list[cur]
  return (
    <div className="video">
      <video key={v.url} src={v.url} controls autoPlay muted playsInline />
      <div className="video-bar">
        {list.map((x, i) => (
          <button key={x.name} className="chip light" aria-pressed={i === cur} onClick={() => setCur(i)}>
            {LABEL[x.name]?.[lang] ?? x.name}
          </button>
        ))}
      </div>
    </div>
  )
}
