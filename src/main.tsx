import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design-system/tokens.css'
import './design-system/semantic-tokens.css'
import './design-system/typography.css'
import './design-system/motion.css'
import './index.css'
import './i18n'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import ProtectedRoute from './components/auth/ProtectedRoute.tsx'
import { BrowserRouter } from 'react-router-dom'
import { installCsrfFetch } from './lib/csrfFetch.ts'
import { registerPwaServiceWorker } from './lib/pwa.ts'

installCsrfFetch()
registerPwaServiceWorker()

const routerBasename = import.meta.env.BASE_URL === '/'
  ? undefined
  : import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename}>
      <AuthProvider><ProtectedRoute><App /></ProtectedRoute></AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
