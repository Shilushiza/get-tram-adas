import { useEffect, useRef, useState } from 'react'

/** Канвас под размер контейнера с учётом devicePixelRatio. */
export function useCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [])
  const ctx = () => {
    const c = ref.current
    const g = c?.getContext('2d')
    if (!c || !g) return null
    const dpr = window.devicePixelRatio || 1
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, c.width, c.height)
    return g
  }
  return { ref, size, ctx }
}
