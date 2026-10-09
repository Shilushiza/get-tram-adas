import { Component, type ReactNode } from 'react'

/** Если браузер не дал WebGL (старый ноутбук, проектор, выключено ускорение), 3D-сцена падает.
 *  Без границы ошибок падает вся страница; с ней на месте сцены остаётся понятная подсказка. */
export default class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.warn('3D scene disabled:', e) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
