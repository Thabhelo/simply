import { lazy, Suspense } from 'react'
import { privacyPolicy, securityPage, termsOfService } from './legal/content.ts'

// Code-split per route so each page's heavy deps load only when that route is
// visited: framer-motion (App) stays off /guide, and react-markdown + KaTeX
// (GuidePage) stay off the landing page and library.
const App = lazy(() => import('./App.tsx'))
const GuidePage = lazy(() => import('./GuidePage.tsx'))
const LibraryPage = lazy(() => import('./LibraryPage.tsx'))
const LegalPage = lazy(() => import('./LegalPage.tsx'))

const ContactPage = lazy(() => import('./ContactPage.tsx'))

function routeFor(path: string) {
  if (path === '/guide') return <GuidePage />
  if (path === '/library') return <LibraryPage />
  if (path === '/privacy') return <LegalPage doc={privacyPolicy} />
  if (path === '/terms') return <LegalPage doc={termsOfService} />
  if (path === '/security') return <LegalPage doc={securityPage} />
  if (path === '/contact') return <ContactPage />
  return <App />
}

export function RootPage() {
  return <Suspense fallback={null}>{routeFor(window.location.pathname)}</Suspense>
}
