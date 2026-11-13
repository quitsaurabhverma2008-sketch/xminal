export const WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XMINAL — Every coding agent. One terminal.</title>
<style>
  :root {
    --bg: #0b0d10;
    --panel: #101318;
    --panel-2: #161a21;
    --line: #222a35;
    --text: #dbe7f3;
    --muted: #7a8a9c;
    --cyan: #22d3ee;
    --blue: #38bdf8;
    --violet: #a78bfa;
    --green: #7fd88f;
    --amber: #e5c07b;
    --red: #e06c75;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    display: grid; grid-template-rows: auto 1fr auto; height: 100vh; overflow: hidden;
  }
  /* ── header ─────────────────────────────────────────────── */
  header {
    display: flex; align-items: center; gap: 14px; padding: 12px 16px;
    border-bottom: 1px solid var(--line); background: rgba(16,19,24,0.9); backdrop-filter: blur(8px);
  }
  .logo { letter-spacing: 6px; font-weight: 700; font-size: 15px;
    background: linear-gradient(90deg, var(--cyan), var(--blue), var(--violet));
    -webkit-background-clip: text; background-clip: text; color: transparent; white-space: nowrap; }
  .logo small { display: block; letter-spacing: 2px; font-size: 9px; color: var(--muted); font-weight: 400; -webkit-text-fill-color: var(--muted); }
  .pill { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--muted);
    border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
  .pill b { color: var(--cyan); font-weight: 600; }
  .spacer { flex: 1; }
  .iconbtn { background: none; border: 1px solid var(--line); color: var(--muted); width: 32px; height: 32px;
    border-radius: 6px; cursor: pointer; font-size: 14px; }
  .iconbtn:hover { color: var(--text); border-color: var(--cyan); }
  /* ── layout ─────────────────────────────────────────────── */
  main { display: grid; grid-template-columns: 260px 1fr; min-height: 0; }
  /* ── sidebar ────────────────────────────────────────────── */
  aside {
    border-right: 1px solid var(--line); background: var(--panel); display: flex; flex-direction: column; min-height: 0;
  }
  .side-head { padding: 12px; border-bottom: 1px solid var(--line); display: flex; gap: 8px; align-items: center; }
  .newbtn { flex: 1; background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.35); color: var(--cyan);
    border-radius: 6px; padding: 8px 10px; cursor: pointer; font: inherit; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  .newbtn:hover { background: rgba(34,211,238,0.16); }
  .sessions { flex: 1; overflow-y: auto; padding: 8px; }
  .session { display: block; width: 100%; text-align: left; background: none; border: 1px solid transparent;
    border-radius: 8px; padding: 8px 10px; color: var(--text); cursor: pointer; font: inherit; margin-bottom: 4px; }
  .session:hover { background: var(--panel-2); }
  .session.active { border-color: var(--line); background: var(--panel-2); }
  .session .title { font-size: 12px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session .meta { font-size: 10px; color: var(--muted); margin-top: 3px; }
  .side-foot { padding: 10px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; line-height: 1.7; }
  /* ── chat ───────────────────────────────────────────────── */
  .chat { display: flex; flex-direction: column; min-height: 0; background: radial-gradient(1200px 500px at 50% -200px, rgba(34,211,238,0.06), transparent); }
  .stream { flex: 1; overflow-y: auto; padding: 20px; max-width: 880px; width: 100%; margin: 0 auto; }
  .msg { margin: 0 0 14px; padding: 0; line-height: 1.6; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
  .msg.user { color: #a5f3fc; }
  .msg.assistant { color: var(--text); }
  .msg.meta { color: var(--muted); font-size: 11px; margin: 4px 0 10px; }
  .msg-row { display: flex; gap: 10px; margin: 0 0 16px; }
  .avatar { flex: 0 0 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; letter-spacing: 1px; }
  .avatar.user { background: #164e63; color: #22d3ee; }
  .avatar.assistant { background: #1e1b4b; color: #a78bfa; }
  .bubble { padding: 10px 14px; border-radius: 10px; max-width: 100%; }
  .bubble.user { background: #0f2233; border: 1px solid #164e63; }
  .bubble.assistant { background: var(--panel); border: 1px solid var(--line); }
  code.block { display: block; background: #05070a; border: 1px solid var(--line); border-radius: 8px;
    padding: 12px 14px; margin: 8px 0; overflow-x: auto; font-size: 12px; line-height: 1.55; color: #a9e9c0; position: relative; }
  code.block .lang { position: absolute; top: 6px; right: 60px; font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
  code.block .copy { position: absolute; top: 6px; right: 8px; font-size: 9px; background: var(--panel-2); border: 1px solid var(--line);
    color: var(--muted); border-radius: 4px; padding: 2px 6px; cursor: pointer; }
  code.block .copy:hover { color: var(--text); }
  .inline { background: var(--panel-2); color: var(--amber); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  .cursor { display: inline-block; width: 8px; height: 14px; background: var(--cyan); margin-left: 2px; vertical-align: -2px; animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  /* ── composer ─────────────────────────────────────────────── */
  .composer { border-top: 1px solid var(--line); padding: 12px 16px; background: var(--panel); }
  .composer-inner { max-width: 880px; margin: 0 auto; display: flex; gap: 10px; align-items: flex-end; }
  textarea { flex: 1; background: var(--panel-2); border: 1px solid var(--line); color: var(--text);
    border-radius: 10px; padding: 12px 14px; font: inherit; font-size: 13px; resize: none; min-height: 46px; max-height: 220px; line-height: 1.5; }
  textarea:focus { outline: none; border-color: var(--cyan); }
  .sendbtn { background: linear-gradient(90deg,#0891b2,#2563eb); border: 0; color: #fff; border-radius: 10px;
    padding: 0 22px; height: 46px; cursor: pointer; font: inherit; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
  .sendbtn:disabled { opacity: 0.45; cursor: wait; }
  .hint { text-align: center; color: var(--muted); font-size: 10px; margin-top: 8px; max-width: 880px; margin-left: auto; margin-right: auto; }
  .hint b { color: var(--cyan); font-weight: 600; }
  /* ── mobile ────────────────────────────────────────────────── */
  @media (max-width: 820px) {
    main { grid-template-columns: 1fr; }
    aside { display: none; }
    header { padding: 10px; gap: 8px; }
    .logo small { display: none; }
  }
</style>
</head>
<body>
<header>
  <div class="logo">XMINAL<small>EVERY CODING AGENT · ONE TERMINAL</small></div>
  <span class="pill">model <b id="modelName">auto</b></span>
  <span class="pill">mode <b id="modeName">build</b></span>
  <span class="pill">turns <b id="turnsCount">0</b></span>
  <span class="pill">spent <b id="costSpent">$0.0000</b></span>
  <div class="spacer"></div>
  <button class="iconbtn" id="clearBtn" title="Clear conversation">🗑</button>
  <button class="iconbtn" id="stopBtn" title="Stop (Esc)">⏹</button>
</header>

<main>
  <aside>
    <div class="side-head"><button class="newbtn" id="newSession">+ New session</button></div>
    <div class="sessions" id="sessions"></div>
    <div class="side-foot">
      XMINAL web UI · served by <b style="color:var(--text)">xminal serve</b><br/>
      API: <span style="color:var(--text)">/v1/chat/completions</span> · SSE streaming<br/>
      Auth: <input id="token" type="password" placeholder="Bearer token (optional)" autocomplete="off" style="width:100%;margin-top:6px;background:#0b0d10;border:1px solid var(--line);color:var(--text);border-radius:6px;padding:6px 8px;font:inherit;font-size:11px" />
    </div>
  </aside>

  <section class="chat">
    <div class="stream" id="stream">
      <div class="msg meta">Connected to the local XMINAL server. Type below and press <b style="color:var(--cyan)">Enter</b>.</div>
    </div>
    <div class="composer">
      <div class="composer-inner">
        <textarea id="input" placeholder="Ask XMINAL…  (/) for commands, Esc to stop" rows="1"></textarea>
        <button class="sendbtn" id="send">Send</button>
      </div>
      <div class="hint"><b>Enter</b> send · <b>Shift+Enter</b> newline · <b>Esc</b> stop · server: <b id="serverHint">local</b></div>
    </div>
  </section>
</main>

<script>
  const $ = (id) => document.getElementById(id);
  const stream = $('stream'), input = $('input'), sendBtn = $('send');
  const modelName = $('modelName'), modeName = $('modeName');
  const turnsCount = $('turnsCount'), costSpent = $('costSpent');
  const tokenEl = $('token');
  let busy = false, abort = null, sessionId = null, turns = 0, cost = 0;

  tokenEl.value = sessionStorage.getItem('xminal-token') || '';
  tokenEl.addEventListener('input', () => sessionStorage.setItem('xminal-token', tokenEl.value));

  function headers() {
    const h = { 'content-type': 'application/json' };
    if (tokenEl.value) h.authorization = 'Bearer ' + tokenEl.value;
    return h;
  }
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  // lightweight markdown-ish renderer: code fences, inline code, bold
  function renderMd(src) {
    const parts = src.split(/(\`\`\`[\s\S]*?\`\`\`)/g);
    let out = '';
    for (const part of parts) {
      if (part.startsWith('\`\`\`')) {
        const m = /^\`\`\`(\w*)\n([\s\S]*?)\`\`\`$/.exec(part);
        const lang = (m && m[1]) || 'code', code = (m && m[2]) || part.slice(3, -3);
        out += '<code class="block"><span class="lang">' + escHtml(lang) + '</span><button class="copy" onclick="navigator.clipboard.writeText(this.parentNode.innerText.replace(/^[A-Za-z]*\\\\n/,\'\'))">copy</button>' + escHtml(code) + '</code>';
      } else {
        let p = escHtml(part);
        p = p.replace(/\`([^\`]+)\`/g, '<span class="inline">$1</span>');
        p = p.replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>');
        out += p;
      }
    }
    return out;
  }
  function addRow(role, text, streaming) {
    const row = document.createElement('div');
    row.className = 'msg-row';
    row.innerHTML = '<div class="avatar ' + role + '">' + (role === 'user' ? 'YOU' : 'AI') + '</div><div class="bubble ' + role + '"></div>';
    const bubble = row.querySelector('.bubble');
    bubble.innerHTML = renderMd(text);
    stream.appendChild(row);
    stream.scrollTop = stream.scrollHeight;
    return bubble;
  }
  function appendText(bubble, chunk) {
    bubble.innerHTML = renderMd(bubble.dataset.raw + chunk);
    bubble.dataset.raw = (bubble.dataset.raw || '') + chunk;
    stream.scrollTop = stream.scrollHeight;
  }
  async function ask() {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    input.style.height = 'auto';
    addRow('user', text);
    const bubble = addRow('assistant', '');
    bubble.dataset.raw = '';
    busy = true; sendBtn.disabled = true;
    const controller = new AbortController();
    abort = controller;
    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ messages: [{ role: 'user', content: text }], stream: true }),
        signal: controller.signal,
      });
      if (!res.ok) { bubble.textContent = 'HTTP ' + res.status; return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\\n\\n')) >= 0) {
          const frame = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!frame.startsWith('data:')) continue;
          const data = frame.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
            if (delta && delta.content) appendText(bubble, delta.content);
            if (chunk.x_xminal) {
              turns += chunk.x_xminal.turns || 0;
              cost += chunk.x_xminal.costUsd || 0;
              turnsCount.textContent = String(turns);
              costSpent.textContent = '$' + cost.toFixed(4);
              sessionId = chunk.x_xminal.sessionId || sessionId;
              refreshSessions();
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') bubble.textContent = 'connection error: ' + err;
    } finally {
      busy = false; sendBtn.disabled = false; abort = null;
      input.focus();
    }
  }
  async function refreshSessions() {
    try {
      const res = await fetch('/v1/sessions', { headers: headers() });
      if (!res.ok) return;
      const data = await res.json();
      const box = $('sessions');
      box.innerHTML = '';
      for (const s of (data.data || []).slice(0, 30)) {
        const btn = document.createElement('button');
        btn.className = 'session' + (s.id === sessionId ? ' active' : '');
        btn.innerHTML = '<div class="title">' + escHtml(s.title || 'untitled') + '</div><div class="meta">' + new Date(s.updatedAt || s.createdAt || Date.now()).toLocaleString() + ' · ' + (s.messageCount || 0) + ' msg</div>';
        btn.addEventListener('click', () => { sessionId = s.id; render(); refreshSessions(); });
        box.appendChild(btn);
      }
    } catch {}
  }
  async function render() {
    // placeholder — sessions are listed, not re-rendered in this lightweight client
  }
  sendBtn.addEventListener('click', ask);
  $('stopBtn').addEventListener('click', () => { if (abort) abort.abort(); });
  $('clearBtn').addEventListener('click', () => { stream.innerHTML = ''; turns = 0; cost = 0; turnsCount.textContent = '0'; costSpent.textContent = '$0.0000'; });
  $('newSession').addEventListener('click', () => { stream.innerHTML = ''; sessionId = null; turns = 0; cost = 0; turnsCount.textContent = '0'; costSpent.textContent = '$0.0000'; refreshSessions(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
    if (e.key === 'Escape' && abort) abort.abort();
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(220, input.scrollHeight) + 'px'; });
  // boot
  (async () => {
    try {
      const res = await fetch('/v1/models', { headers: headers() });
      const data = await res.json();
      const def = (data.data || [])[0];
      if (def) modelName.textContent = def.id;
    } catch {}
    refreshSessions();
    input.focus();
  })();
</script>
</body>
</html>
`;
