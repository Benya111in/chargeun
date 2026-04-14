import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DemoTheaterPage from './DemoTheaterPage.tsx'

const normalizedPathname = window.location.pathname.replace(/\/+$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {normalizedPathname === '/demo' ? <DemoTheaterPage /> : <App />}
  </StrictMode>,
)
