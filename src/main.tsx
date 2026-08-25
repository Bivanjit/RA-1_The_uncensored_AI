import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Brand-only compatibility layer. It changes visible product branding without
// touching the existing model/inference implementation in App.tsx.
const applyRA1Branding = () => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node: Node | null

  while ((node = walker.nextNode())) {
    if (node.nodeValue?.includes('WormGPT')) textNodes.push(node as Text)
  }

  for (const text of textNodes) {
    text.nodeValue = text.nodeValue!.replaceAll('WormGPT', 'RA-1')
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
