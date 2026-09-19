import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './design-system/tokens.css'
import './design-system/semantic-tokens.css'
import './design-system/typography.css'
import './design-system/motion.css'
import './index.css'
import './App.css'
import './design-system/scrollbars.css'
import './i18n/bootLocale'
import { AuthProvider } from './context/AuthContext.tsx'
import ProtectedRoute from './components/auth/ProtectedRoute.tsx'
import { BrowserRouter } from 'react-router-dom'
import { installCsrfFetch } from './lib/csrfFetch.ts'
import { registerPwaServiceWorker } from './lib/pwa.ts'
import NativeServerGate from './mobile/NativeServerGate.tsx'
import { initializeNativeSession } from './mobile/nativeSession.ts'

const App = lazy(() => import('./App.tsx'))

async function bootstrap() {
  await initializeNativeSession()
  installCsrfFetch()
  registerPwaServiceWorker()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <NativeServerGate>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <ProtectedRoute>
              <Suspense fallback={<h1>loading...</h1>}>
                <App />
              </Suspense>
            </ProtectedRoute>
          </AuthProvider>
        </BrowserRouter>
      </NativeServerGate>
    </StrictMode>,
  )
}

void bootstrap()
