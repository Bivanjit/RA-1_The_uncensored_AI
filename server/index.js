import express from 'express';
import cors from 'cors';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';
import simpleGit from 'simple-git';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const isWin = process.platform === 'win32';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Helper: spawn a shell command cross-platform
function spawnShell(command, cwd) {
  if (isWin) {
    return spawn('cmd', ['/c', command], { cwd, env: process.env, shell: false });
  } else {
    return spawn('sh', ['-c', command], { cwd, env: process.env });
  }
}

wss.on('connection', (ws) => {
  let proc = null;
  ws.on('message', (raw) => {
    try {
      const { type, code, lang, command, cwd } = JSON.parse(raw.toString());

      if (type === 'run_code') {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgpt-'));
        let filename, runCmd;

        if (lang === 'python' || lang === 'py') {
          filename = path.join(tmpDir, 'main.py');
          fs.writeFileSync(filename, code);
          // Windows uses 'python', Linux/macOS uses 'python3'
          runCmd = isWin ? `python "${filename}"` : `python3 "${filename}"`;
        } else if (lang === 'javascript' || lang === 'js') {
          filename = path.join(tmpDir, 'main.js');
          fs.writeFileSync(filename, code);
          runCmd = `node "${filename}"`;
        } else if (lang === 'bash' || lang === 'sh') {
          if (isWin) {
            filename = path.join(tmpDir, 'main.bat');
            fs.writeFileSync(filename, code);
            runCmd = `cmd /c "${filename}"`;
          } else {
            filename = path.join(tmpDir, 'main.sh');
            fs.writeFileSync(filename, code);
            runCmd = `bash "${filename}"`;
          }
        } else {
          ws.send(JSON.stringify({ type: 'stderr', data: 'Unsupported language: ' + lang }));
          ws.send(JSON.stringify({ type: 'exit', code: 1 }));
          return;
        }

        ws.send(JSON.stringify({ type: 'start' }));
        proc = spawnShell(runCmd, tmpDir);
        proc.stdout.on('data', d => ws.send(JSON.stringify({ type: 'stdout', data: d.toString() })));
        proc.stderr.on('data', d => ws.send(JSON.stringify({ type: 'stderr', data: d.toString() })));
        proc.on('close', code => {
          ws.send(JSON.stringify({ type: 'exit', code }));
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        });

      } else if (type === 'kill') {
        if (proc) {
          if (isWin) {
            // On Windows, SIGTERM doesn't work — use taskkill
            try { exec(`taskkill /pid ${proc.pid} /T /F`); } catch {}
          } else {
            proc.kill('SIGTERM');
          }
          proc = null;
        }
      } else if (type === 'shell') {
        proc = spawnShell(command, cwd || os.homedir());
        proc.stdout.on('data', d => ws.send(JSON.stringify({ type: 'stdout', data: d.toString() })));
        proc.stderr.on('data', d => ws.send(JSON.stringify({ type: 'stderr', data: d.toString() })));
        proc.on('close', code => ws.send(JSON.stringify({ type: 'exit', code })));
      }
    } catch (e) { ws.send(JSON.stringify({ type: 'stderr', data: e.message })); }
  });
  ws.on('close', () => { if (proc) proc.kill(); });
});

console.log("CHAT ROUTE REGISTERED");

app.post('/api/chat', async (req, res) => {
  console.log("CHAT REQUEST RECEIVED");
  const {
    messages = [],
    model = 'godmoded/llama3-lexi-uncensored',
    temperature = 0.7,
    stream = true,
    ollamaUrl = 'http://localhost:11434'
  } = req.body || {};

  try {
    const ollamaRes = await fetch(ollamaUrl.replace(/\/+$/, '') + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature, stream: true }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      return res.status(502).json({ error: `Ollama returned ${ollamaRes.status}: ${errText.slice(0, 500)}` });
    }
    if (!ollamaRes.body) {
      return res.status(502).json({ error: 'Ollama returned an empty body' });
    }

    // Non-streaming callers (summarize, variants) expect plain JSON
    if (stream === false) {
      const data = await ollamaRes.json();
      return res.json({ message: { role: 'assistant', content: (data.message && data.message.content) || '' }, done: true });
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const j = JSON.parse(t);
          if (j && j.message && typeof j.message.content === 'string') {
            res.write(`data: ${JSON.stringify({ message: { role: 'assistant', content: j.message.content }, done: false })}\n\n`);
          } else if (j && j.done) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          }
        } catch (_) { /* skip incomplete JSON */ }
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Ollama chat error:', err);
    if (!res.headersSent) {
      return res.status(502).json({ error: String(err && err.message ? err.message : err) });
    }
    res.write(`data: ${JSON.stringify({ error: String(err && err.message ? err.message : err), done: true })}\n\n`);
    res.end();
  }
});

app.get('/api/ollama/status', async (req, res) => {
  const base = req.query.url || 'http://localhost:11434';
  try { const r = await fetch(`${base}/api/tags`); res.json({ connected: r.ok }); } catch { res.json({ connected: false }); }
});

app.get('/api/ollama/models', async (req, res) => {
  const base = req.query.url || 'http://localhost:11434';
  try { const r = await fetch(`${base}/api/tags`); if (!r.ok) throw new Error('Not reachable'); res.json(await r.json()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/project/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file' }); return; }
    const TEXT_EXTS = ['.js','.ts','.tsx','.jsx','.py','.html','.css','.json','.md','.txt','.sh','.yaml','.yml','.toml','.rs','.go','.java','.cpp','.c','.h','.sql'];
    let files = [];
    if (req.file.originalname.endsWith('.zip')) {
      const zip = new AdmZip(req.file.buffer);
      for (const e of zip.getEntries()) {
        if (!e.isDirectory) {
          const ext = path.extname(e.entryName).toLowerCase();
          const isText = TEXT_EXTS.includes(ext) || !ext;
          files.push({ name: e.entryName, content: isText ? e.getData().toString('utf8') : `[binary: ${ext}]`, type: isText ? 'text' : 'binary' });
        }
      }
    } else {
      files = [{ name: req.file.originalname, content: req.file.buffer.toString('utf8'), type: 'text' }];
    }
    res.json({ files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/save-file', async (req, res) => {
  try { await fsp.writeFile(req.body.path, req.body.content, 'utf8'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

const gitR = (p) => simpleGit(p || process.cwd());
app.post('/api/git/status', async (req, res) => { try { res.json({ status: await gitR(req.body.repoPath).status() }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/api/git/diff', async (req, res) => { try { res.json({ diff: req.body.file ? await gitR(req.body.repoPath).diff([req.body.file]) : await gitR(req.body.repoPath).diff() }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/api/git/commit', async (req, res) => {
  try {
    const git = gitR(req.body.repoPath);
    if (req.body.files?.length) await git.add(req.body.files); else await git.add('.');
    res.json({ result: await git.commit(req.body.message || 'WormGPT commit') });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/git/branch', async (req, res) => { try { await gitR(req.body.repoPath).checkoutLocalBranch(req.body.name); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });

const distPath = path.join(__dirname, '..', 'app', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_, res) => res.sendFile(path.join(distPath, 'index.html')));
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n WormGPT Server running at http://localhost:${PORT}`);
  console.log(` WebSocket at ws://localhost:${PORT}\n`);
  console.log(` Password: Realnojokepplwazy1234\n`);
});
