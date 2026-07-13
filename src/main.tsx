import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RootPage } from './RootPage.tsx'
import { bridgeExtensionAuth } from './extensionAuth.ts'

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787'
bridgeExtensionAuth(apiBase)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootPage />
  </StrictMode>,
)
