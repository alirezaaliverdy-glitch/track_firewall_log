import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import ProtectedRoute from './components/auth/ProtectedRoute.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider><ProtectedRoute><App /></ProtectedRoute></AuthProvider>
  </StrictMode>,
)
