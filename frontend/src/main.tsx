import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// шрифты лежат локально (без Google Fonts и CDN, сайт работает в РФ без VPN): только нужные начертания, кириллица + латиница
import '@fontsource/golos-text/cyrillic-400.css'
import '@fontsource/golos-text/latin-400.css'
import '@fontsource/golos-text/cyrillic-500.css'
import '@fontsource/golos-text/latin-500.css'
import '@fontsource/golos-text/cyrillic-600.css'
import '@fontsource/golos-text/latin-600.css'
import '@fontsource/golos-text/cyrillic-700.css'
import '@fontsource/golos-text/latin-700.css'
import '@fontsource/sofia-sans-condensed/cyrillic-600.css'
import '@fontsource/sofia-sans-condensed/latin-600.css'
import '@fontsource/sofia-sans-condensed/cyrillic-700.css'
import '@fontsource/sofia-sans-condensed/latin-700.css'
import 'uplot/dist/uPlot.min.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
