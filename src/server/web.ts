export const WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XMINAL — Every coding agent. One terminal.</title>
<style>
  :root {
    --bg: #07090c; --panel: #0d1117; --panel2: #12161d; --panel3: #1a2030;
    --border: #1f2733; --text: #dbe3ec; --muted: #6b7a8f; --cyan: #22d3ee; --blue: #38bdf8;
    --violet: #a78bfa; --green: #7fd88f; --amber: #e5c07b; --red: #e06c75;
    --grad: linear-gradient(135deg, #22d3ee, #38bdf8, #a78bfa);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg); color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 13px; line-height: 1.6; display: flex; height: 100vh; overflow: hidden;
  }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #263042; border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }

  /* ── sidebar ───────────────────────────────── */
  #sidebar {
    width: 264px; flex: 0 0 264px; background: var(--panel); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; min-height: 0; transition: margin-left .25s;
  }
  #sidebar.hidden { margin-left: -264px; }
  .brand { padding: 18px 18px 14px; border-bottom: 1px solid var(--border); }
  .brand h1 { font-size: 19px; letter-spacing: 6px; font-weight: 800; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .brand p { font-size: 9px; letter-spacing: 2.2px; color: var(--muted); margin-top: 4px; text-transform: uppercase; }
  .side-section { padding: 12px 14px 6px; }
  .side-label { font-size: 9px; letter-spacing: 2px; color: var(--muted); text-transform: uppercase; padding: 0 4px 8px; }
  #newChat {
    width: 100%; background: linear-gradient(135deg, #164e63, #1e3a5f); color: #a5f3fc;
    border: 1px solid #155e75; border-radius: 8px; padding: 9px 12px; font: inherit; font-size: 11px;
    letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; transition: transform .08s, filter .15s;
  }
  #newChat:hover { filter: brightness(1.25); }
  #newChat:active { transform: scale(.98); }
  #sessions { flex: 1; overflow-y: auto; padding: 0 10px; }
  .session {
    display: block; width: 100%; text-align: left; background: transparent; border: 1px solid transparent;
    border-radius: 8px; padding: 8px 10px; cursor: pointer; color: var(--text); font: inherit;
    margin-bottom: 4px; transition: background .1s, border-color .1s;
  }
  .session:hover { background: var(--panel2); }
  .session.active { background: var(--panel3); border-color: #2b3a4d; }
  .session .t { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session .m { font-size: 9px; color: var(--muted); margin-top: 2px; }
  .side-foot { padding: 12px 16px; border-top: 1px solid var(--border); font-size: 10px; color: var(--muted); line-height: 1.9; }
  .dot { display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:6px;box-shadow:0 0 6px var(--green); }

  /* ── main column ───────────────────────────── */
  #main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

  /* topbar */
  #topbar { height: 48px; border-bottom: 1px solid var(--border); background: rgba(13,17,23,.85); backdrop-filter: blur(8px); display: flex; align-items: center; gap: 12px; padding: 0 14px; flex: 0 0 48px; }
  #topbar .title { font-size: 11px; color: var(--muted); letter-spacing: 1px; }
  .model-pill, .mode-pill {
    font-size: 10px; padding: 4px 11px; border-radius: 999px; border: 1px solid var(--border);
    background: var(--panel2); color: var(--cyan); cursor: pointer; position: relative;
  }
  .mode-pill { color: var(--amber); }
  .model-pill select { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; }
  .usage { margin-left: auto; font-size: 10px; color: var(--muted); display: flex; gap: 14px; }
  .usage b { color: var(--text); font-weight: 600; }

  /* chat area */
  #chat { flex: 1; overflow-y: auto; padding: 22px 0; scroll-behavior: smooth; }
  .chat-inner { max-width: 860px; margin: 0 auto; padding: 0 18px; }
  .empty { text-align: center; color: var(--muted); padding-top: 12vh; }
  .empty .glyph { font-size: 54px; margin-bottom: 14px; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .empty h2 { font-size: 16px; color: var(--text); letter-spacing: 1px; }
  .empty p { font-size: 11px; margin-top: 8px; }
  .msg { margin-bottom: 18px; animation: fadeUp .25s ease; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .msg-row { display: flex; gap: 12px; }
  .avatar { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; letter-spacing: .5px; }
  .avatar.user { background: linear-gradient(135deg,#164e63,#155e75); color: #67e8f9; }
  .avatar.assistant { background: linear-gradient(135deg,#2e1065,#3b0764); color: #c4b5fd; }
  .bubble { flex: 1; min-width: 0; padding: 12px 15px; border-radius: 10px; }
  .bubble.user { background: #101c26; border: 1px solid #16384a; color: #a5f3fc; white-space: pre-wrap; }
  .bubble.assistant { background: var(--panel2); border: 1px solid var(--border); }
  .bubble :where(h1,h2,h3,h4) { margin: 14px 0 8px; line-height: 1.35; }
  .bubble h1 { font-size: 17px; } .bubble h2 { font-size: 15px; } .bubble h3 { font-size: 13px; }
  .bubble p { margin: 8px 0; }
  .bubble ul, .bubble ol { margin: 8px 0 8px 20px; }
  .bubble li { margin: 3px 0; }
  .bubble strong { color: #fff; }
  .bubble a { color: var(--blue); text-decoration: none; border-bottom: 1px dotted var(--blue); }
  .bubble code { background: #05080d; border: 1px solid var(--border); padding: 1px 6px; border-radius: 4px; font-size: 11.5px; color: #a9e9c0; }
  .bubble pre { background: #05080d; border: 1px solid var(--border); border-radius: 9px; padding: 12px 14px; overflow-x: auto; margin: 10px 0; position: relative; }
  .bubble pre code { background: none; border: 0; padding: 0; color: #a9e9c0; font-size: 11px; }
  .bubble pre .lang { position: absolute; top: 6px; left: 12px; font-size: 9px; color: var(--dim, #536273); letter-spacing: 1.5px; text-transform: uppercase; }
  .bubble pre .copybtn { position: absolute; top: 6px; right: 8px; background: var(--panel3); border: 1px solid var(--border); color: var(--muted); border-radius: 5px; font-size: 9px; padding: 2px 7px; cursor: pointer; letter-spacing: .5px; }
  .bubble pre .copybtn:hover { color: var(--text); border-color: var(--cyan); }

  /* tool cards */
  .tool { border: 1px solid var(--border); background: #0a0f16; border-radius: 9px; padding: 8px 12px; margin: 8px 0; font-size: 11px; }
  .tool-head { display: flex; align-items: center; gap: 8px; color: var(--cyan); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
  .tool-head .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tool-args { color: var(--muted); font-size: 10.5px; margin: 4px 0 2px; white-space: pre-wrap; word-break: break-all; max-height: 84px; overflow: hidden; }
  .tool-out { color: #8fd0a0; font-size: 10.5px; margin-top: 5px; white-space: pre-wrap; word-break: break-all; max-height: 130px; overflow: auto; border-top: 1px dashed var(--border); padding-top: 6px; }
  .tool-out.err { color: var(--red); }
  .reasoning { color: #6b7a8f; font-size: 11px; border-left: 2px solid #2b3648; padding-left: 10px; margin: 8px 0; font-style: italic; }

  .cursor { display: inline-block; width: 8px; height: 15px; background: var(--cyan); animation: blink 1s steps(1) infinite; vertical-align: -2px; }
  @keyframes blink { 50% { opacity: 0; } }

  /* ── composer ─────────────────────────────── */
  #composer { border-top: 1px solid var(--border); background: var(--panel); padding: 12px 18px 16px; flex: 0 0 auto; }
  .composer-box { max-width: 860px; margin: 0 auto; position: relative; }
  #input {
    width: 100%; background: var(--panel2); border: 1px solid var(--border); color: var(--text);
    border-radius: 12px; padding: 14px 16px 40px; font: inherit; font-size: 13px; resize: none;
    min-height: 56px; max-height: 240px; line-height: 1.55; outline: none; transition: border-color .15s;
  }
  #input:focus { border-color: #2e5266; box-shadow: 0 0 0 3px rgba(34,211,238,.06); }
  .composer-actions { position: absolute; bottom: 10px; right: 10px; display: flex; gap: 8px; align-items: center; }
  #sendBtn { background: var(--grad); border: 0; color: #05141c; font-weight: 800; letter-spacing: 1px; font-size: 11px; border-radius: 8px; height: 32px; padding: 0 18px; cursor: pointer; text-transform: uppercase; }
  #sendBtn:disabled { opacity: .4; cursor: default; }
  #stopBtn { background: #3a1420; border: 1px solid #5b1f2e; color: #fca5a5; border-radius: 8px; height: 32px; width: 32px; cursor: pointer; font-size: 12px; display: none; }
  .hint { max-width: 860px; margin: 6px auto 0; font-size: 9px; color: var(--muted); text-align: center; letter-spacing: .5px; }
  .hint b { color: var(--cyan); font-weight: 600; }

  /* token field */
  #tokenRow { display: flex; gap: 8px; align-items: center; padding: 8px 18px; border-bottom: 1px solid var(--border); background: #0a0f16; font-size: 10px; color: var(--muted); }
  #tokenRow input { flex: 1; max-width: 340px; background: var(--panel2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 5px 8px; font: inherit; font-size: 10px; }
  #tokenRow button { background: var(--panel3); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font: inherit; font-size: 9px; padding: 5px 10px; cursor: pointer; letter-spacing: 1px; text-transform: uppercase; }

  @media (max-width: 900px) { #sidebar { display: none; } .usage { display: none; } }
</style>
</head>
<body>

<aside id="sidebar">
  <div class="brand"><h1>XMINAL</h1><p>Every coding agent · one terminal</p></div>
  <div class="side-section">
    <div class="side-label">Sessions</div>
    <button id="newChat">＋ New chat</button>
  </div>
  <div id="sessions"></div>
  <div class="side-foot"><span class="dot"></span>local server online<br/>API · <b style="color:var(--text)">/v1/agent/stream</b><br/><span style="color:#3d4a5c">v<span id="ver"></span></span></div>
</aside>

<div id="main">
  <div id="topbar">
    <button id="toggleSide" class="model-pill" style="cursor:pointer" title="Toggle sidebar">☰</button>
    <span class="mode-pill" id="modePill">build</span>
    <span class="model-pill" id="modelPill">auto<select id="modelSelect"><option value="">auto</option></select></span>
    <span class="usage"><span>turns <b id="turnsN">0</b></span><span>spent <b id="costUsd">$0.0000</b></span><span>tokens <b id="tokN">0</b></span></span>
  </div>
  <div id="tokenRow"><span>AUTH</span><input id="token" type="password" placeholder="Bearer token (optional — only if server started with --token)" autocomplete="off" /><button id="saveToken">Save</button></div>

  <div id="chat"><div class="chat-inner" id="chatInner">
    <div class="empty" id="emptyState">
      <div class="glyph">⌘</div>
      <h2>What should XMINAL build?</h2>
      <p>Ask anything — the agent streams its answer here with live tool calls.</p>
    </div>
  </div></div>

  <div id="composer">
    <div class="composer-box">
      <textarea id="input" rows="1" placeholder="Message XMINAL…  (/ for commands, Esc to stop)"></textarea>
      <div class="composer-actions">
        <button id="sendBtn">Send</button>
        <button id="stopBtn" title="Stop (Esc)">■</button>
      </div>
    </div>
    <div class="hint"><b>Enter</b> send · <b>Shift+Enter</b> new line · <b>Esc</b> stop · <b>/</b> commands</div>
  </div>
</div>

<script>
  const $ = (id) => document.getElementById(id);
  const chatInner = $('chatInner'), input = $('input'), sendBtn = $('sendBtn'), stopBtn = $('stopBtn');
  const sessionsEl = $('sessions');
  let sessionId = null, busy = false, abortCtl = null, turns = 0, costUsd = 0, tokens = 0;
  const VERSION = document.getElementById('ver');

  const headers = () => {
    const h = { 'content-type': 'application/json' };
    const t = sessionStorage.getItem('xminal-token') || $('token').value;
    if (t) h.authorization = 'Bearer ' + t;
    return h;
  };
  const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  $('token').value = sessionStorage.getItem('xminal-token') || '';
  $('saveToken').addEventListener('click', () => { sessionStorage.setItem('xminal-token', $('token').value); $('saveToken').textContent = 'Saved ✓'; setTimeout(() => $('saveToken').textContent = 'Save', 1200); });

  // ── markdown-ish renderer ─────────────────────────
  const RENDER = (src) => {
    const fence = /\`\`\`([a-zA-Z0-9_+-]*)\\n([\s\S]*?)\`\`\`/g;
    let out = '', last = 0, m;
    while ((m = fence.exec(src))) {
      out += inline(esc(src.slice(last, m.index)));
      const lang = m[1] || 'code', code = m[2];
      out += '<pre><span class="lang">' + esc(lang) + '</span><button class="copybtn" data-copy="' + esc(encodeURIComponent(code)) + '">COPY</button><code>' + esc(code) + '</code></pre>';
      last = m.index + m[0].length;
    }
    out += inline(esc(src.slice(last)));
    return out;
    function inline(s) {
      return s
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\\[([^\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/(^|\\n)(#{1,6}) (.+?)(?=\\n|$)/g, (_, p1, h, t) => p1 + '<h' + h.length + '>' + esc(t) + '</h' + h.length + '>')
        .replace(/(^|\\n)- (.+?)(?=\\n|$)/g, '$1<li>$2</li>');
    }
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.copybtn');
    if (!btn) return;
    navigator.clipboard.writeText(decodeURIComponent(btn.getAttribute('data-copy') || ''));
    btn.textContent = 'COPIED';
    setTimeout(() => (btn.textContent = 'COPY'), 1100);
  });

  const scroll = () => { $('chat').scrollTop = $('chat').scrollHeight; };
  const clearEmpty = () => { const e = $('emptyState'); if (e) e.remove(); };
  const addUser = (text) => {
    clearEmpty();
    const row = document.createElement('div'); row.className = 'msg';
    row.innerHTML = '<div class="msg-row"><div class="avatar user">YOU</div><div class="bubble user">' + esc(text) + '</div></div>';
    chatInner.appendChild(row); scroll();
  };
  const beginAssistant = () => {
    clearEmpty();
    const row = document.createElement('div'); row.className = 'msg';
    row.innerHTML = '<div class="msg-row"><div class="avatar assistant">AI</div><div class="bubble assistant"><span class="cursor"></span></div></div>';
    chatInner.appendChild(row); scroll();
    return row.querySelector('.bubble');
  };
  const addTool = (name) => {
    const el = document.createElement('div'); el.className = 'tool';
    el.innerHTML = '<div class="tool-head"><span class="spin">◐</span> ' + esc(name) + '</div><div class="tool-args"></div>';
    const args = document.createElement('div'); args.className = 'tool-args';
    el.appendChild(args); chatInner.appendChild(el); scroll();
    return { el, args };
  };

  // ── SSE streaming ─────────────────────────
  const send = async () => {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = ''; input.style.height = 'auto';
    addUser(text);
    const bubble = beginAssistant();
    busy = true; sendBtn.disabled = true; stopBtn.style.display = 'block';
    abortCtl = new AbortController();
    let raw = '', reasoning = '';
    const toolCards = new Map();
    try {
      const res = await fetch('/v1/agent/stream', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ prompt: text, sessionId: sessionId || undefined }),
        signal: abortCtl.signal,
      });
      if (!res.ok || !res.body) { bubble.innerHTML = 'HTTP ' + res.status + ' — is the XMINAL server running with /v1/agent/stream?'; return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\\n\\n')) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          let event = 'message', data = '';
          for (const line of frame.split('\\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          let msg = null; try { msg = JSON.parse(data); } catch { continue; }
          if (event === 'session') sessionId = msg.sessionId;
          else if (event === 'reasoning' && msg.text) {
            reasoning += msg.text;
            let re = bubble.querySelector('.reasoning');
            if (!re) { re = document.createElement('div'); re.className = 'reasoning'; bubble.prepend(re); }
            re.textContent = reasoning;
          } else if (event === 'text') {
            raw += msg.text;
            const cur = bubble.querySelector('.cursor'); if (cur) cur.remove();
            bubble.innerHTML = RENDER(raw) + '<span class="cursor"></span>';
          } else if (event === 'tool_call') {
            const card = addTool(msg.name);
            card.args.textContent = typeof msg.arguments === 'string' ? msg.arguments : JSON.stringify(msg.arguments);
            toolCards.set(msg.id, card);
          } else if (event === 'tool_result') {
            const card = toolCards.get((msg.name || '')) || null;
            const out = document.createElement('div'); out.className = 'tool-out' + (msg.isError ? ' err' : '');
            out.textContent = String(msg.content ?? '').slice(0, 4000);
            (card ? card.el : bubble).appendChild(out);
          } else if (event === 'usage' || event === 'done') {
            turns = msg.turns ?? turns; costUsd += Number(msg.costUsd || 0); tokens += Number(msg.usage?.inputTokens || 0) + Number(msg.usage?.outputTokens || 0);
            $('turnsN').textContent = turns; $('costUsd').textContent = '$' + costUsd.toFixed(4); $('tokN').textContent = tokens;
          }
          scroll();
        }
      }
      bubble.innerHTML = RENDER(raw);
      loadSessions();
    } catch (err) {
      if (err && err.name !== 'AbortError') bubble.textContent = 'error: ' + err;
    } finally {
      busy = false; sendBtn.disabled = false; stopBtn.style.display = 'none';
      const cur = bubble.querySelector('.cursor'); if (cur) cur.remove();
      input.focus();
    }
  };
  sendBtn.addEventListener('click', send);
  stopBtn.addEventListener('click', () => abortCtl && abortCtl.abort());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape' && busy) abortCtl && abortCtl.abort();
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(240, input.scrollHeight) + 'px'; });

  // ── sessions ─────────────────────────────
  const loadSessions = async () => {
    try {
      const r = await fetch('/v1/sessions', { headers: headers() });
      if (!r.ok) return;
      const { data } = await r.json();
      sessionsEl.innerHTML = '';
      for (const s of (data || []).slice(0, 40)) {
        const b = document.createElement('button'); b.className = 'session' + (s.id === sessionId ? ' active' : '');
        b.innerHTML = '<div class="t">' + esc(s.title || 'untitled') + '</div><div class="m">' + new Date(s.updatedAt || s.createdAt || Date.now()).toLocaleDateString() + ' · ' + (s.messageCount || 0) + ' msg</div>';
        b.addEventListener('click', () => { sessionId = s.id; loadSessions(); });
        sessionsEl.appendChild(b);
      }
    } catch {}
  };
  $('newChat').addEventListener('click', () => { sessionId = null; chatInner.innerHTML = ''; const e = document.createElement('div'); e.className = 'empty'; e.id = 'emptyState'; e.innerHTML = '<div class="glyph">⌘</div><h2>What should XMINAL build?</h2>'; chatInner.appendChild(e); $('turnsN').textContent = '0'; $('costUsd').textContent = '$0.0000'; $('tokN').textContent = '0'; loadSessions(); });
  $('toggleSide').addEventListener('click', () => $('sidebar').classList.toggle('hidden'));

  // ── boot ─────────────────────────
  fetch('/health').then(r => r.json()).then(d => { VERSION.textContent = d.version || ''; }).catch(() => {});
  fetch('/v1/models', { headers: headers() }).then(r => r.json()).then(d => {
    const sel = $('modelSelect');
    for (const m of (d.data || [])) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.id; sel.appendChild(o); }
    if (d.data && d.data[0]) { $('modelPill').firstChild.textContent = d.data[0].id.split('/').pop(); }
  }).catch(() => {});
  loadSessions(); input.focus();
</script>
</body>
</html>
`;
