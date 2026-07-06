import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RootPage } from './RootPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootPage />
  </StrictMode>,
)
