import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { clearChunkReload } from './app/lazy-page.ts'
import { App } from './app/App.tsx'
import './index.css'

clearChunkReload()

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element #root is missing')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
