'use strict';
const $ = (id) => document.getElementById(id);
const api = async (path, opts = {}) => {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
};
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let state = { status: null, picked: store.get('picked') || '', running: false, version: '' };

// ---------- tabs ----------
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== `tab-${b.dataset.tab}`; });
  if (b.dataset.tab === 'style') loadStyle();
  if (b.dataset.tab === 'sounds') loadSounds();
  if (b.dataset.tab === 'rules') loadRules();
}));

// ---------- status and setup banner ----------
async function loadStatus() {
  const s = await api('/api/status');
  state.status = s;
  $('folder').textContent = s.folder;
  const todo = [];
  const a = s.agents;
  if (!a.claude && !a.codex) todo.push('Install Claude Code or Codex and sign in once (this is what does the editing).');
  if (!s.kitInstalled) todo.push('Install the editing engine (press Run setup).');
  if (!s.hasKey) todo.push('Add a free Groq key for transcription, or use local faster-whisper in chat.');
  if (!s.hasStyle) todo.push('Pick your style in the Style tab.');
  $('banner').hidden = !todo.length;
  $('todo').innerHTML = todo.map((t) => `<li>${esc(t)}</li>`).join('');
  $('runSetup').hidden = s.kitInstalled;
  $('keyBox').hidden = s.hasKey;
  const sel = $('agent');
  const prev = sel.value || store.get('agent') || '';
  sel.innerHTML = '';
  if (a.claude) sel.add(new Option('Claude Code', 'claude'));
  if (a.codex) sel.add(new Option('Codex', 'codex'));
  if (!sel.options.length) sel.add(new Option('No agent found', ''));
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  applyJob(s.job);
}
$('agent').addEventListener('change', (e) => store.set('agent', e.target.value));
$('runSetup').addEventListener('click', async () => {
  $('setupLog').hidden = false; $('setupLog').textContent = '';
  try { await post('/api/setup', {}); } catch (e) { $('setupLog').textContent = e.message; }
});
$('saveKey').addEventListener('click', async () => {
  try { await post('/api/key', { key: $('keyInput').value }); $('keyInput').value = ''; loadStatus(); }
  catch (e) { alert(e.message); }
});

// ---------- upload ----------
function upload(file, url, done) {
  const bar = $('upload'); const fill = bar.firstElementChild;
  bar.hidden = false; fill.style.width = '0';
  const x = new XMLHttpRequest();
  x.open('POST', `${url}?name=${encodeURIComponent(file.name)}`);
  x.upload.onprogress = (e) => { if (e.lengthComputable) fill.style.width = `${(e.loaded / e.total) * 100}%`; };
  x.onload = () => {
    bar.hidden = true;
    let j = {}; try { j = JSON.parse(x.responseText); } catch {}
    if (x.status !== 200) alert(j.error || 'Upload failed');
    else done(j.name);
  };
  x.onerror = () => { bar.hidden = true; alert('Upload failed'); };
  x.send(file);
}
function wireDrop(zone, input, handler) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', (e) => handler([...e.dataTransfer.files]));
  input.addEventListener('change', () => { handler([...input.files]); input.value = ''; });
}
wireDrop($('drop'), $('file'), (files) => {
  if (files[0]) upload(files[0], '/api/upload', (name) => { state.picked = name; store.set('picked', name); loadInbox(); });
});

async function loadInbox() {
  const { files } = await api('/api/inbox');
  if (!files.some((f) => f.name === state.picked)) state.picked = files[0]?.name || '';
  $('inbox').innerHTML = files.length ? files.map((f) =>
    `<li class="${f.name === state.picked ? 'pick' : ''}" data-n="${esc(f.name)}"><span class="name">${esc(f.name)}</span><small>${mb(f.size)}</small><button data-del="${esc(f.name)}">Remove</button></li>`).join('')
    : '<li><span class="name">No videos yet. Drop one above.</span></li>';
  $('inbox').querySelectorAll('li[data-n]').forEach((li) => li.addEventListener('click', (e) => {
    if (e.target.dataset.del) return;
    state.picked = li.dataset.n; store.set('picked', state.picked); loadInbox();
  }));
  $('inbox').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Remove ${b.dataset.del} from the inbox? Edited drafts are not deleted.`)) return;
    await api(`/api/inbox?name=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); loadInbox();
  }));
}

// ---------- edit and notes ----------
$('editBtn').addEventListener('click', async () => {
  if (!state.picked) return alert('Drop or pick a video first.');
  if (!$('agent').value) return alert('No Claude Code or Codex found. See the setup box at the top.');
  try {
    startProgress('edit');
    await post('/api/edit', { file: state.picked, story: $('story').value, length: $('length').value, orientation: $('orientation').value, agent: $('agent').value });
  } catch (e) { endProgress(false); alert(e.message); }
});
const sendNote = async (text) => {
  if (!text.trim()) return;
  try { startProgress('note'); await post('/api/note', { text }); $('note').value = ''; }
  catch (e) { endProgress(false); alert(e.message); }
};
$('sendNote').addEventListener('click', () => sendNote($('note').value));
$('approve').addEventListener('click', () => sendNote('approved, render the final'));
['Faster', 'Bigger captions', 'Change the hook', 'Quieter sounds', 'No sound effects', 'Always put captions above my head'].forEach((t) => {
  const b = document.createElement('button'); b.textContent = t;
  b.addEventListener('click', () => { $('note').value = $('note').value ? `${$('note').value}, ${t.toLowerCase()}` : t; });
  $('chips').appendChild(b);
});

function startProgress(kind) {
  state.running = true;
  $('progress').hidden = false; $('spin').className = 'spin';
  $('progTitle').textContent = kind === 'edit' ? 'Editing your video...' : 'Working on your notes...';
  $('steps').innerHTML = ''; $('detail').textContent = '';
  $('editBtn').disabled = $('sendNote').disabled = $('approve').disabled = true;
  $('progress').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function endProgress(ok) {
  state.running = false;
  $('spin').className = 'spin stop';
  $('progTitle').textContent = ok ? 'Done' : 'Stopped';
  $('editBtn').disabled = $('sendNote').disabled = $('approve').disabled = false;
}
function applyJob(job) {
  if (job?.running && !state.running && job.kind !== 'setup') startProgress(job.kind);
  if (job?.kind === 'setup') $('runSetup').disabled = !!job.running;
}
function addLog(l) {
  if (l.level === 'step' || l.level === 'done') {
    const li = document.createElement('li'); li.textContent = l.text; $('steps').appendChild(li);
  } else if (l.level === 'error') {
    const li = document.createElement('li'); li.textContent = l.text; li.className = 'err'; $('steps').appendChild(li);
  } else if (l.level === 'summary') {
    $('summary').textContent = l.text;
  }
  $('detail').textContent += `${l.text}\n`;
  const sl = $('setupLog'); if (!sl.hidden) { sl.textContent += `${l.text}\n`; sl.scrollTop = sl.scrollHeight; }
}

// ---------- drafts ----------
async function loadDrafts(selectLatest) {
  const { files } = await api('/api/outbox');
  const drafts = files.filter((f) => !f.test);
  $('result').hidden = !drafts.length;
  if (!drafts.length) return;
  $('versions').innerHTML = drafts.map((f) => `<option value="${esc(f.name)}">${esc(f.name)}${f.final ? ' (final)' : ''}</option>`).join('');
  if (selectLatest || !drafts.some((f) => f.name === state.version)) state.version = drafts[0].name;
  $('versions').value = state.version;
  showVideo();
}
function showVideo() {
  const v = $('video');
  const src = `/media/${encodeURIComponent(state.version)}?t=${Date.now()}`;
  v.src = src; v.load();
}
$('versions').addEventListener('change', (e) => { state.version = e.target.value; showVideo(); });

// ---------- style ----------
const OPTIONS = {
  Format: ['Vertical 9:16 (Reels, TikTok, Shorts)', 'Horizontal 16:9 (YouTube)', 'Both'],
  Captions: ['Word by word, white with shadow', 'Word by word, bold caps on key words', 'Key-word pills', 'Full-sentence subtitles', 'None'],
  'Caption position': ['Upper third, clear of app buttons', 'Middle', 'Lower third'],
  Hook: ['Big text in the first 3 seconds', 'No hook text'],
  Pace: ['Natural (keep short pauses)', 'Tight (cut every breath and pause)'],
  Graphics: ['Minimal', 'Some motion cards', 'Heavy motion graphics'],
  Color: ['Natural, no grade', 'Warm', 'Cool', 'Black and white', 'Orange and teal'],
  Sound: ['Voice only', 'Light sound effects, no music', 'Sound effects plus a quiet music bed'],
};
function selectFor(key, value, id) {
  const opts = [...(OPTIONS[key] || [])];
  const same = value && opts.find((o) => o.toLowerCase() === value.toLowerCase());
  if (same) value = same;
  else if (value) opts.unshift(value);
  return `<label>${esc(key)}<select data-style="${esc(key)}" ${id ? `id="${id}"` : ''}>${opts.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
}
async function loadStyle() {
  const { style, keys } = await api('/api/style');
  $('styleForm').innerHTML = keys.filter((k) => k !== 'Sound').map((k) => selectFor(k, style[k])).join('') + selectFor('Sound', style.Sound);
}
$('saveStyle').addEventListener('click', async () => {
  const style = {};
  $('styleForm').querySelectorAll('select').forEach((s) => { style[s.dataset.style] = s.value; });
  await post('/api/style', { style });
  $('styleMsg').textContent = 'Saved.'; setTimeout(() => { $('styleMsg').textContent = ''; }, 2000);
  loadStatus();
});

// ---------- sounds ----------
wireDrop($('dropSound'), $('soundFile'), async (files) => {
  for (const f of files) await new Promise((ok) => upload(f, '/api/sounds', ok));
  loadSounds();
});
async function loadSounds() {
  const { files } = await api('/api/sounds');
  $('soundList').innerHTML = files.length ? files.map((f) =>
    `<li><span class="name">${esc(f.name)}</span><audio controls preload="none" src="/sounds/${encodeURIComponent(f.name)}"></audio><button data-del="${esc(f.name)}">Remove</button></li>`).join('')
    : '<li><span class="name">No sounds yet. Without files, the editor makes simple effects or skips them.</span></li>';
  $('soundList').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/sounds?name=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); loadSounds();
  }));
  const { style } = await api('/api/style');
  $('soundModeBox').innerHTML = selectFor('Sound', style.Sound, 'soundMode');
}
$('saveSound').addEventListener('click', async () => {
  await post('/api/style', { style: { Sound: $('soundMode').value } });
  $('saveSound').textContent = 'Saved'; setTimeout(() => { $('saveSound').textContent = 'Save sound mode'; }, 1500);
});

// ---------- rules ----------
async function loadRules() {
  const { rules } = await api('/api/rules');
  $('ruleList').innerHTML = rules.length ? rules.map((r, i) =>
    `<li><span class="name" style="white-space:normal">${esc(r.replace(/^(- |## )/, ''))}</span><button data-i="${i}">Delete</button></li>`).join('')
    : '<li><span class="name">No rules yet. Notes with "always" or "never" are saved here.</span></li>';
  $('ruleList').querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/rules?index=${b.dataset.i}`, { method: 'DELETE' }); loadRules();
  }));
}
$('addRule').addEventListener('click', async () => {
  if (!$('ruleInput').value.trim()) return;
  try { await post('/api/rules', { rule: $('ruleInput').value }); $('ruleInput').value = ''; loadRules(); } catch (e) { alert(e.message); }
});
$('ruleInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addRule').click(); });

// ---------- live events ----------
function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('hello', (e) => { const d = JSON.parse(e.data); if (d.job?.running) { applyJob(d.job); d.log.forEach(addLog); } });
  es.addEventListener('log', (e) => addLog(JSON.parse(e.data)));
  es.addEventListener('job', (e) => {
    const j = JSON.parse(e.data);
    if (j.running) applyJob(j);
    else if (j.kind === 'setup') loadStatus();
    else { endProgress(!$('steps').querySelector('.err')); loadDrafts(true); }
  });
  es.addEventListener('status', () => loadStatus());
  es.onerror = () => { es.close(); setTimeout(connect, 2000); };
}

(async () => {
  try {
    await loadStatus(); await loadInbox(); await loadDrafts(true);
  } catch (e) { document.body.insertAdjacentHTML('afterbegin', `<p class="err" style="padding:16px">${esc(e.message)}</p>`); }
  connect();
})();
