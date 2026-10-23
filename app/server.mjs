#!/usr/bin/env node
// kaareyesAiEditor app: a local web page for people who do not use the terminal.
// Uses only Node built-ins. Starts the server and opens your browser.
//
//   node app/server.mjs
//
// The editing itself is done by your own AI agent (Claude Code or Codex) running in the
// background with the same skill the chat uses: .agents/skills/kaareyesAiEditor/SKILL.md
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import {
  createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync,
  statSync, unlinkSync, writeFileSync, appendFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(appDir, '..');
const publicDir = join(appDir, 'public');
const inbox = join(root, 'inbox');
const outbox = join(root, 'outbox');
const sounds = join(root, 'my-sounds');
const stylePath = join(root, 'my-style.md');
const rulesPath = join(root, 'my-rules.md');
const envPath = join(root, '.env');
const sessionPath = join(appDir, '.session.json');
const PORT = Number(process.env.PORT) || 4747;
const HOST = '127.0.0.1';
const win = process.platform === 'win32';
for (const d of [inbox, outbox, sounds]) mkdirSync(d, { recursive: true });

const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};

// ---------- helpers ----------
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = (req, limit = 1e6) => new Promise((ok, no) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > limit) { no(new Error('too big')); req.destroy(); } });
  req.on('end', () => ok(s));
  req.on('error', no);
});
const readJson = async (req) => { try { return JSON.parse((await readBody(req)) || '{}'); } catch { return {}; } };
// Keep only a plain file name: no folders, no "..", no odd characters.
const safeName = (n) => basename(String(n || '').replace(/\\/g, '/')).replace(/[^\w.\- ()]/g, '_').replace(/^\.+/, '');
const tryRun = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: win, timeout: 15000 });
  return !r.error && r.status === 0 ? (r.stdout || '').trim().split('\n')[0] : null;
};
const openBrowser = (url) => {
  const [cmd, args] = win ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch {}
};
const readText = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// ---------- state ----------
const clients = new Set();
let job = { running: false, kind: '', agent: '', startedAt: 0 };
let log = [];
const loadSession = () => { try { return JSON.parse(readText(sessionPath)); } catch { return {}; } };
const saveSession = (s) => { try { writeFileSync(sessionPath, JSON.stringify(s)); } catch {} };
let session = loadSession(); // { agent, id }

const emit = (event, data) => {
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(line);
};
const say = (text, level = 'step') => {
  log.push({ t: Date.now(), text, level });
  if (log.length > 400) log.shift();
  emit('log', { text, level });
};

// ---------- status ----------
const agents = () => {
  const c = tryRun('claude', ['--version']);
  const x = tryRun('codex', ['--version']);
  return { claude: c, codex: x };
};
const envKeySet = () => /^GROQ_API_KEY=\S+/m.test(readText(envPath));
const status = () => ({
  kitInstalled: existsSync(join(root, 'kit', 'node_modules', 'hyperframes')),
  hasStyle: existsSync(stylePath),
  hasKey: envKeySet(),
  agents: agents(),
  session,
  job,
  platform: process.platform,
  folder: root,
});

// ---------- agent runner ----------
const friendly = (cmd) => {
  const c = cmd.toLowerCase();
  if (c.includes('transcribe')) return 'Transcribing your voice (free)...';
  if (c.includes('new-video')) return 'Setting up the project...';
  if (c.includes('cut-silences') || c.includes('silence')) return 'Cutting dead air...';
  if (c.includes('cut-mistakes')) return 'Checking for retakes and mistakes...';
  if (c.includes('hyperframes') && c.includes('render')) return 'Rendering the draft video...';
  if (c.includes('hyperframes') && c.includes('lint')) return 'Checking the design...';
  if (c.includes('ffmpeg')) return 'Processing video and sound...';
  if (c.includes('preflight') || c.includes('validate')) return 'Checking the edit...';
  return null;
};
let lastFriendly = '';
const progress = (cmd) => {
  const f = friendly(cmd);
  if (f && f !== lastFriendly) { lastFriendly = f; say(f); }
};

const handleLine = (agent, line, state) => {
  let ev;
  try { ev = JSON.parse(line); } catch { return; }
  if (agent === 'claude') {
    if (ev.session_id) state.id = ev.session_id;
    if (ev.type === 'assistant') {
      for (const part of ev.message?.content || []) {
        if (part.type === 'tool_use') {
          if (part.name === 'Bash') progress(part.input?.command || '');
          else if (part.name === 'Read' && /SKILL|my-style|my-rules/i.test(part.input?.file_path || '')) {
            if (!state.readStyle) { state.readStyle = true; say('Reading your style and rules...'); }
          }
        } else if (part.type === 'text' && part.text?.trim()) {
          state.last = part.text.trim();
        }
      }
    } else if (ev.type === 'result') {
      if (ev.result) state.last = String(ev.result).trim();
      if (ev.is_error) state.error = true;
    }
  } else {
    if (ev.type === 'thread.started' && ev.thread_id) state.id = ev.thread_id;
    const item = ev.item;
    if (item) {
      if (item.type === 'command_execution' && item.command) progress(item.command);
      if (item.type === 'agent_message' && item.text) state.last = String(item.text).trim();
    }
    if (ev.type === 'turn.failed' || ev.type === 'error') state.error = true;
  }
};

const runAgent = (agent, prompt, kind, resumeId) => {
  if (job.running) return { error: 'Another job is still running. Please wait for it to finish.' };
  const bin = agent === 'codex' ? 'codex' : 'claude';
  const args = agent === 'codex'
    ? (resumeId ? ['exec', 'resume', '--json', resumeId, '-'] : ['exec', '--json', '-'])
    : ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
      ...(resumeId ? ['--resume', resumeId] : [])];
  if (agent === 'codex') {
    args.splice(args.indexOf('--json'), 0, '-c', 'sandbox_mode="workspace-write"',
      '-c', 'sandbox_workspace_write.network_access=true');
  }
  job = { running: true, kind, agent, startedAt: Date.now() };
  log = []; lastFriendly = '';
  emit('job', job);
  say(kind === 'edit' ? 'Starting your editor...' : 'Sending your note...');
  const before = new Set(readdirSync(outbox));
  const state = { id: resumeId || '', last: '', error: false, readStyle: false };
  let child;
  try {
    // shell is needed on Windows because claude and codex are .cmd shims; every argument is a fixed constant or a validated id.
    child = spawn(bin, args, { cwd: root, shell: win, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    job = { running: false, kind, agent, startedAt: 0 };
    return { error: `Could not start ${bin}: ${e.message}` };
  }
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { handleLine(agent, buf.slice(0, i).trim(), state); buf = buf.slice(i + 1); }
  });
  let errText = '';
  child.stderr.on('data', (d) => { errText += d; if (errText.length > 4000) errText = errText.slice(-4000); });
  child.on('error', (e) => { state.error = true; errText += e.message; });
  child.on('close', (code) => {
    if (buf.trim()) handleLine(agent, buf.trim(), state);
    job = { running: false, kind, agent, startedAt: 0 };
    if (state.id) { session = { agent, id: state.id }; saveSession(session); }
    const fresh = readdirSync(outbox).filter((f) => !before.has(f) && VIDEO.has(extname(f).toLowerCase()));
    const failed = code !== 0 || state.error;
    if (failed && !fresh.length) {
      const hint = /login|auth|api key/i.test(errText + state.last)
        ? ' Open a terminal and sign in to your agent once, then try again.' : '';
      say(`The edit did not finish.${hint}`, 'error');
      if (errText.trim()) say(errText.trim().slice(-600), 'detail');
    } else {
      say('Done. Your draft is ready.', 'done');
    }
    if (state.last) say(state.last, 'summary');
    emit('job', job);
    emit('outbox', { files: listOutbox(), fresh });
  });
  return { ok: true };
};

const buildPrompt = ({ file, story, length, orientation }) => {
  const orient = { vertical: 'vertical 9:16', horizontal: 'horizontal 16:9 for YouTube', both: 'both a vertical 9:16 and a horizontal 16:9 version' }[orientation] || 'vertical 9:16';
  const parts = ['edit this'];
  if (story) parts.push(`story: ${story}`);
  if (length) parts.push(`${length} seconds`);
  parts.push(orient);
  return `${parts.join(', ')}.\nSource video: inbox/${file}\n\n`
    + 'You are running from the kaareyesAiEditor app. Nobody is watching a chat, so do not ask '
    + 'questions: use my-style.md, my-rules.md and sensible defaults. Do not open the video yourself; '
    + 'the app plays it. Save the draft to outbox/ as the skill says, then finish with 3 to 5 short '
    + 'plain-words bullets about what you did and the output file name.';
};

// ---------- files ----------
const listInbox = () => readdirSync(inbox)
  .filter((f) => VIDEO.has(extname(f).toLowerCase()))
  .map((f) => ({ name: f, size: statSync(join(inbox, f)).size, mtime: statSync(join(inbox, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
const listOutbox = () => readdirSync(outbox)
  .filter((f) => VIDEO.has(extname(f).toLowerCase()))
  .map((f) => ({ name: f, size: statSync(join(outbox, f)).size, mtime: statSync(join(outbox, f)).mtimeMs, test: f === 'setup-test.mp4', final: /-final\./.test(f) }))
  .sort((a, b) => b.mtime - a.mtime);
const listSounds = () => readdirSync(sounds)
  .filter((f) => AUDIO.has(extname(f).toLowerCase()))
  .map((f) => ({ name: f, size: statSync(join(sounds, f)).size }));

const saveUpload = (req, res, dir, allowed) => {
  const url = new URL(req.url, `http://${HOST}`);
  const name = safeName(url.searchParams.get('name'));
  if (!name || !allowed.has(extname(name).toLowerCase())) return json(res, 400, { error: 'That file type is not supported.' });
  const dest = join(dir, name);
  const out = createWriteStream(dest);
  req.pipe(out);
  out.on('finish', () => json(res, 200, { ok: true, name }));
  out.on('error', (e) => json(res, 500, { error: e.message }));
  req.on('aborted', () => { out.destroy(); try { unlinkSync(dest); } catch {} });
};

const serveFile = (req, res, path) => {
  if (!existsSync(path) || !statSync(path).isFile()) { res.writeHead(404); return res.end('Not found'); }
  const size = statSync(path).size;
  const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    let start = range[1] ? Number(range[1]) : 0;
    let end = range[2] ? Number(range[2]) : size - 1;
    if (!range[1] && range[2]) { start = Math.max(0, size - Number(range[2])); end = size - 1; }
    end = Math.min(end, size - 1);
    if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
    return createReadStream(path, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size, 'Cache-Control': 'no-store' });
  createReadStream(path).pipe(res);
};

// ---------- style and rules ----------
const STYLE_KEYS = ['Format', 'Captions', 'Caption position', 'Hook', 'Pace', 'Graphics', 'Color', 'Sound'];
const parseStyle = () => {
  const out = {};
  for (const line of readText(stylePath).split('\n')) {
    const m = /^\s*[-*]\s*([^:]+):\s*(.*)$/.exec(line);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
};
const writeStyle = (obj) => {
  const clean = (v) => String(v).replace(/[\r\n]+/g, ' ').trim();
  const lines = ['# My style', ''];
  const keys = [...STYLE_KEYS, ...Object.keys(obj).filter((k) => !STYLE_KEYS.includes(k))];
  for (const k of keys) if (obj[k]) lines.push(`- ${clean(k)}: ${clean(obj[k])}`);
  writeFileSync(stylePath, lines.join('\n') + '\n');
};
const parseRules = () => {
  const text = readText(rulesPath);
  return text.split(/\n(?=- |## )/).map((s) => s.trim()).filter((s) => s && !/^# [^#]/.test(s));
};
const writeRules = (items) => writeFileSync(rulesPath, '# My rules\n\n' + items.join('\n\n') + (items.length ? '\n' : ''));

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const p = decodeURIComponent(url.pathname);
  // Block other websites from calling this local API (also guards against DNS rebinding).
  const host = req.headers.host;
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) { res.writeHead(403); return res.end('Forbidden'); }
  const origin = req.headers.origin;
  if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) {
    res.writeHead(403); return res.end('Forbidden');
  }
  try {
    if (p === '/api/status') return json(res, 200, status());
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ job, log })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/inbox' && req.method === 'GET') return json(res, 200, { files: listInbox() });
    if (p === '/api/outbox' && req.method === 'GET') return json(res, 200, { files: listOutbox() });
    if (p === '/api/upload' && req.method === 'POST') return saveUpload(req, res, inbox, VIDEO);
    if (p === '/api/inbox' && req.method === 'DELETE') {
      const name = safeName(url.searchParams.get('name'));
      if (name && existsSync(join(inbox, name))) unlinkSync(join(inbox, name));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/edit' && req.method === 'POST') {
      const b = await readJson(req);
      const file = safeName(b.file);
      if (!file || !existsSync(join(inbox, file))) return json(res, 400, { error: 'Pick a video first.' });
      const agent = b.agent === 'codex' ? 'codex' : 'claude';
      const length = Math.max(0, Math.min(600, parseInt(b.length, 10) || 0));
      const prompt = buildPrompt({ file, story: String(b.story || '').slice(0, 500).replace(/[\r\n]+/g, ' '), length, orientation: b.orientation });
      session = { agent, id: '' }; saveSession(session);
      return json(res, 200, runAgent(agent, prompt, 'edit'));
    }
    if (p === '/api/note' && req.method === 'POST') {
      const b = await readJson(req);
      const text = String(b.text || '').trim().slice(0, 2000);
      if (!text) return json(res, 400, { error: 'Type a note first.' });
      if (!session.id || !/^[\w-]{8,100}$/.test(session.id)) return json(res, 400, { error: 'Start an edit first, then send notes.' });
      return json(res, 200, runAgent(session.agent, text, 'note', session.id));
    }
    if (p === '/api/setup' && req.method === 'POST') {
      if (job.running) return json(res, 200, { error: 'Another job is still running.' });
      job = { running: true, kind: 'setup', agent: '', startedAt: Date.now() }; log = [];
      emit('job', job); say('Running setup. This can take a few minutes the first time...');
      const child = spawn(process.execPath, [join(root, 'setup.mjs')], { cwd: root });
      const pipe = (d) => String(d).split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => say(l, l.startsWith('==') ? 'step' : 'detail'));
      child.stdout.on('data', pipe); child.stderr.on('data', pipe);
      child.on('close', (code) => {
        job = { running: false, kind: 'setup', agent: '', startedAt: 0 };
        say(code === 0 ? 'Setup finished.' : 'Setup stopped. Read the lines above for what is missing.', code === 0 ? 'done' : 'error');
        emit('job', job); emit('status', status());
      });
      return json(res, 200, { ok: true });
    }
    if (p === '/api/key' && req.method === 'POST') {
      const key = String((await readJson(req)).key || '').trim();
      if (!/^[\w-]{20,200}$/.test(key)) return json(res, 400, { error: 'That does not look like a Groq key.' });
      const lines = readText(envPath).split('\n').filter((l) => l && !l.startsWith('GROQ_API_KEY='));
      writeFileSync(envPath, [...lines, `GROQ_API_KEY=${key}`].join('\n') + '\n');
      return json(res, 200, { ok: true });
    }
    if (p === '/api/style') {
      if (req.method === 'GET') return json(res, 200, { style: parseStyle(), keys: STYLE_KEYS, exists: existsSync(stylePath) });
      if (req.method === 'POST') {
        const b = await readJson(req);
        writeStyle({ ...parseStyle(), ...(b.style || {}) });
        return json(res, 200, { ok: true });
      }
    }
    if (p === '/api/sounds') {
      if (req.method === 'GET') return json(res, 200, { files: listSounds() });
      if (req.method === 'POST') return saveUpload(req, res, sounds, AUDIO);
      if (req.method === 'DELETE') {
        const name = safeName(url.searchParams.get('name'));
        if (name && existsSync(join(sounds, name))) unlinkSync(join(sounds, name));
        return json(res, 200, { ok: true });
      }
    }
    if (p === '/api/rules') {
      if (req.method === 'GET') return json(res, 200, { rules: parseRules() });
      if (req.method === 'POST') {
        const rule = String((await readJson(req)).rule || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 500);
        if (!rule) return json(res, 400, { error: 'Type a rule first.' });
        const date = new Date().toISOString().slice(0, 10);
        writeRules([...parseRules(), `- ${rule} (added in the app, ${date})`]);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        const i = Number(url.searchParams.get('index'));
        const items = parseRules();
        if (Number.isInteger(i) && i >= 0 && i < items.length) { items.splice(i, 1); writeRules(items); }
        return json(res, 200, { ok: true });
      }
    }
    if (p.startsWith('/media/')) return serveFile(req, res, join(outbox, safeName(p.slice(7))));
    if (p.startsWith('/source/')) return serveFile(req, res, join(inbox, safeName(p.slice(8))));
    if (p.startsWith('/sounds/')) return serveFile(req, res, join(sounds, safeName(p.slice(8))));
    // static page
    const rel = p === '/' ? 'index.html' : safeName(p.slice(1));
    return serveFile(req, res, join(publicDir, rel));
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

server.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    // Already running: just open the browser.
    const ours = await fetch(`http://${HOST}:${PORT}/api/status`).then((r) => r.ok).catch(() => false);
    if (ours) { console.log(`kaareyesAiEditor is already running. Opening http://${HOST}:${PORT}`); openBrowser(`http://${HOST}:${PORT}`); process.exit(0); }
    console.error(`Port ${PORT} is used by another program. Close it or run with PORT=4748 node app/server.mjs`);
    process.exit(1);
  }
  throw e;
});
server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`\nkaareyesAiEditor is open at ${url}\nKeep this window open while you edit. Press Ctrl+C to stop.\n`);
  if (!process.env.NO_OPEN) openBrowser(url);
});
