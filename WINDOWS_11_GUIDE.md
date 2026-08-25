# WormGPT Enhanced — Windows 11 Complete Guide
**For Beginners | Step-by-Step**

---

## What Is This?

WormGPT Enhanced is a **local AI chat interface** that runs entirely on your own PC. It connects to Ollama (a tool that runs AI models locally) and gives you a powerful chat UI with 20+ features — terminal runner, code execution, file editing, Git integration, and more. Nothing is sent to the cloud.

---

## Prerequisites — What You Need to Install First

You need two things before running WormGPT:

### 1. Node.js (JavaScript runtime)

1. Go to **https://nodejs.org**
2. Click the **"LTS"** (Long Term Support) button — the recommended version
3. Download the Windows installer (`.msi` file)
4. Run the installer, click **Next** through all steps, keep defaults
5. When asked about "Tools for Native Modules", you can leave it unchecked

**Verify it worked:** Open a terminal (see below) and type:
```
node -v
```
You should see something like `v22.0.0` — any version 18 or higher is fine.

### 2. Ollama (runs the AI model locally)

1. Go to **https://ollama.com/download/windows**
2. Download and run the installer
3. Ollama installs silently and runs in the background (you'll see it in the system tray)

**Verify it worked:** Open a terminal and type:
```
ollama --version
```
You should see a version number.

---

## How to Open a Terminal on Windows 11

You'll need a terminal (command prompt) to run these steps.

**Method 1 — Windows Terminal (recommended):**
- Press `Win + X` → click **Terminal**
- Or press `Win + R`, type `wt`, press Enter

**Method 2 — PowerShell:**
- Press `Win + S`, type `PowerShell`, press Enter

**Method 3 — Right-click method:**
- Open File Explorer, navigate to the WormGPT folder
- Hold `Shift` and right-click inside the folder
- Click **"Open in Terminal"**

---

## Installation — Step by Step

### Step 1: Extract the ZIP file

1. Right-click `WormgptWindowsEdition.zip`
2. Click **"Extract All..."**
3. Choose a folder, e.g. `C:\WormGPT`
4. Click **Extract**

### Step 2: Open a terminal IN that folder

1. Open File Explorer
2. Navigate to your extracted folder (e.g. `C:\WormGPT\wormgpt_enhanced`)
3. Click the address bar at the top (where it shows the path)
4. Type `cmd` and press **Enter** — a terminal opens directly in that folder

### Step 3: Run the installer

In the terminal, type exactly:
```
install.bat
```
Press **Enter**.

The installer will:
- Check that Node.js is installed
- Check that Ollama is installed
- Start Ollama
- Download the AI model (~4GB, first time only — be patient!)
- Install all code dependencies
- Build the frontend

You'll see progress messages. The model download can take 5–15 minutes depending on your internet speed.

### Step 4: Done!

When you see **"Installation Complete!"**, you're ready to go.

---

## Starting WormGPT

Every time you want to use WormGPT after installation:

**Option A — Double-click:**
Find `start.bat` in the WormGPT folder and double-click it.

**Option B — Terminal:**
Open a terminal in the WormGPT folder and type:
```
start.bat
```

A terminal window will open, and your browser will automatically open to:
**http://localhost:3001**

**Password:** `Realnojokepplwazy1234`

> Keep the terminal window open while using WormGPT. Closing it stops the server.

---

## First-Time Setup Inside the App

1. Open **http://localhost:3001** in your browser
2. Enter the password: `Realnojokepplwazy1234`
3. The app checks if Ollama is running — you'll see a green status indicator
4. The default model is `godmoded/llama3-lexi-uncensored`
5. Start chatting!

---

## Using a Different AI Model

You can use any model from the Ollama library. To pull a different model:

1. Open a terminal
2. Type:
```
ollama pull llama3
```
Replace `llama3` with any model name from **https://ollama.com/library**

Popular options:
- `ollama pull llama3` — General purpose, fast
- `ollama pull mistral` — Good for coding
- `ollama pull codellama` — Specialized for code

Once pulled, select the model from the dropdown in the WormGPT app settings.

---

## Troubleshooting Common Errors

### "Node.js not found"
Node.js is not installed or not in your PATH.
- Re-install Node.js from **https://nodejs.org**
- After installing, **close and reopen** any terminal windows
- Try again

### "Ollama not found"
Ollama is not installed.
- Download from **https://ollama.com/download/windows**
- Install it, then rerun `install.bat`

### "Model pull failed"
The model download failed (usually network issue).
- Manually pull the model after install:
```
ollama pull godmoded/llama3-lexi-uncensored
```

### "Frontend build failed" / TypeScript errors
This can happen if Node modules are corrupted.
```
cd app
rmdir /s /q node_modules
npm install
npm run build
```

### Page loads but shows "Ollama not connected"
Ollama is not running. Fix:
```
ollama serve
```
Leave that terminal open, then start WormGPT again.

### Port 3001 already in use
Something else is using port 3001. Find and close it, or change the port:
```
set PORT=3002
node server\index.js
```
Then open **http://localhost:3002** instead.

### `install.bat` opens and closes instantly
Right-click `install.bat` → **"Run as administrator"** — or open a terminal manually in the folder and type `install.bat`.

---

## Features Reference

| Feature | How to Use |
|---|---|
| **Chat** | Type in the bottom box, press Enter to send |
| **New line in message** | Press `Shift + Enter` |
| **Code Runner** | AI generates code → click the Run button in the code block |
| **Terminal** | Click the Terminal icon in the sidebar |
| **File/Project Upload** | Click the upload icon → upload a ZIP of your project |
| **Mermaid Diagrams** | Ask AI to generate a Mermaid diagram — it renders live |
| **HTML Preview** | AI generates HTML → live preview appears automatically |
| **Command Palette** | Press `Ctrl + K` for quick commands |
| **Dark/Light Mode** | Settings icon → Theme |
| **Multiple Models** | Settings icon → Model selector |
| **Session Resume** | Your last session auto-saves and restores |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift + Enter` | New line in message |
| `Ctrl + K` | Open command palette |
| `ESC` | Close dialogs/modals |
| `↑ / ↓` | Navigate terminal history |

---

## Stopping WormGPT

- Close the terminal window that `start.bat` opened
- Or press `Ctrl + C` in that terminal

Ollama continues running in the background (that's fine, it uses minimal resources when idle). To stop Ollama too: right-click the Ollama icon in your system tray → **Quit**.

---

## Folder Structure

```
wormgpt_enhanced\
├── install.bat          ← Run this ONCE to install
├── start.bat            ← Run this EVERY TIME to start
├── app\                 ← React frontend (UI)
│   ├── src\App.tsx      ← All UI code
│   └── dist\            ← Built frontend (auto-generated)
├── server\
│   └── index.js         ← Backend server
└── WINDOWS_11_GUIDE.md  ← This file
```

---

## Updating / Reinstalling

If something breaks, you can do a clean reinstall:
1. Delete the `app\node_modules` and `server\node_modules` folders
2. Delete `app\dist`
3. Run `install.bat` again

---

*WormGPT Enhanced — Created by MRZXN. Fixed for Windows 11 compatibility.*
