import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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

  while ((node = walker.nextNode())) {
    if (node.nodeValue && Object.keys(replacements).some((key) => node.nodeValue!.includes(key))) {
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

  document.querySelectorAll<HTMLImageElement>('img[src="/wormgpt-logo.jpg"]').forEach((img) => {
    img.src = '/ra1-logo.svg'
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
