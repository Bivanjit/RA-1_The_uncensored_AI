import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Remote API gateway. When configured, chat requests made by the existing
// frontend are transparently routed to the Cloudflare Worker instead of the
// GitHub Pages origin. The UI/model labels remain unchanged.
const RA1_API_URL = (import.meta.env.VITE_RA1_API_URL || window.location.origin).replace(/\/$/, '')
const RA1_ACCESS_CODE = import.meta.env.VITE_RA1_ACCESS_CODE || ''

const nativeFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    const originalUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

    const parsed = new URL(originalUrl, window.location.origin)

    // Only intercept the AI chat endpoint. Other existing frontend/backend
    // features continue using their original same-origin behavior.
    if (parsed.pathname === '/api/chat' && RA1_API_URL !== window.location.origin) {
      const target = new URL('/api/chat', `${RA1_API_URL}/`)
      const headers = new Headers(
        input instanceof Request ? input.headers : init?.headers,
      )
      if (RA1_ACCESS_CODE) headers.set('x-ra1-access-code', RA1_ACCESS_CODE)

      const nextInit: RequestInit = {
        ...(init || {}),
        headers,
      }

      return nativeFetch(target, nextInit)
    }
  } catch {
    // Preserve the browser's native fetch behavior on malformed URLs.
  }

  return nativeFetch(input, init)
}) as typeof window.fetch

// RA-1 branding compatibility layer. Model labels are presentation-only;
// the backend is the source of truth for the actual inference model.
const applyRA1Branding = () => {
  const replacements: Record<string, string> = {
    'WormGPT': 'RA-1',
    'GPT-4': 'GPT-5.6 Sol',
    'GPT-3.5 Turbo': 'GPT-5.5 Pro',
    'Claude 3 Opus': 'Claude Opus 4.1',
    'Llama 2 (Ollama)': 'Gemini 3.7 Flash',
    'Mistral (Ollama)': 'Gemini 3.1 Pro',
    'Llama3 Lexi (Ollama)': 'RA-1 Core (Lexi)',
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node: Node | null

  while ((node = walker.nextNode()) !== null) {
    const value = node.nodeValue
    if (value && Object.keys(replacements).some((key) => value.includes(key))) {
      textNodes.push(node as Text)
    }
  }

  for (const text of textNodes) {
    let value = text.nodeValue || ''
    for (const [from, to] of Object.entries(replacements)) {
      value = value.replaceAll(from, to)
    }
    text.nodeValue = value
  }

  const logoSrc = `${import.meta.env.BASE_URL}RA1-logo.png`
  document.querySelectorAll<HTMLImageElement>('img[src="/wormgpt-logo.jpg"], img[alt="RA-1"]').forEach((img) => {
    if (img.src !== new URL(logoSrc, window.location.href).href) img.src = logoSrc
    img.alt = 'RA-1'
  })

  document.querySelectorAll('meta[name="generator"]').forEach((meta) => meta.remove())
  document.querySelectorAll('.watermark-container, [data-wm], [data-wm-encoded]').forEach((el) => el.remove())
}

const observer = new MutationObserver(() => applyRA1Branding())
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

queueMicrotask(applyRA1Branding)
