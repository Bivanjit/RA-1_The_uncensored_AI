# RA-1 — The Uncensored AI

> **A direct, bold AI interface built for experimentation.**

RA-1 is an independent AI chat interface focused on a less corporate, more direct conversational experience. The frontend is designed to work with remote inference while keeping the model/runtime on the backend.

## ⚡ What RA-1 is built for

- 💻 Programming and technical work
- 🤖 AI experimentation
- 💰 Business and startup ideas
- 📈 Marketing and content creation
- 🚀 Technology
- 🧪 Science and education
- 🎨 Creative work
- 🧠 Open-ended discussion
- 🛠️ Developer workflows

## 😈 Personality

RA-1 is designed to feel **blunt, informal, sarcastic, opinionated and direct** rather than like a corporate support bot.

The personality is a product feature. The exact behavior depends on the model connected to the backend.

## 🧠 Model layer

The current project is structured around Ollama-compatible inference. The existing Lexi/Ollama configuration is intentionally left unchanged during this rebrand.

## ☁️ Architecture

```text
User
 ↓
RA-1 Frontend
 ↓
RA-1 Backend
 ↓
Authentication / Credits
 ↓
Remote or local inference
```

The frontend is intended to remain lightweight: users should not need to download the model itself.

## 💳 Credits

The planned public product model is **10 credits per user**. Credit enforcement should be implemented server-side before public launch so users cannot reset or bypass balances through browser storage.

## 🔐 Security notes

- Never place API keys, database credentials, provider tokens or real backend secrets in frontend code.
- Keep provider credentials in server-side environment variables.
- Treat a client-side password gate as UI access control, not as a real security boundary.
- Do not expose internal infrastructure details in public responses or logs.

## 🧪 Project status

RA-1 is an experimental project under active development. Deployment, authentication, credit enforcement, remote inference and abuse controls are still being developed.

## 📦 Tech stack

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Node.js / Express backend
- WebSocket support
- Ollama-compatible inference

## © Project

RA-1 is an independent experimental software project.

**Brand:** RA-1  
**Product:** The Uncensored AI
