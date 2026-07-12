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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider><ProtectedRoute><App /></ProtectedRoute></AuthProvider>
  </StrictMode>,
)
