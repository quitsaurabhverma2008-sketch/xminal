export const WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XMINAL — Every coding agent. One terminal.</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: #0b0f19; color: #e2e8f0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    display: flex; flex-direction: column;
  }
  header {
    padding: 14px 18px; border-bottom: 1px solid #1e293b; display: flex; align-items: center; gap: 14px;
  }
  header b { letter-spacing: 4px; background: linear-gradient(90deg,#22d3ee,#38bdf8,#a78bfa); -webkit-background-clip: text; background-clip: text; color: transparent; }
  header span { color: #64748b; font-size: 12px; }
  header input { margin-left: auto; background:#0f172a; border:1px solid #1e293b; color:#e2e8f0; padding:6px 10px; border-radius:6px; width:280px; font:inherit; }
  main { flex: 1; overflow-y: auto; padding: 20px; max-width: 900px; width: 100%; margin: 0 auto; }
  .msg { margin: 12px 0; white-space: pre-wrap; line-height: 1.5; }
  .msg.user { color: #a5f3fc; }
  .msg.assistant { color: #e2e8f0; }
  .msg.meta { color: #475569; font-size: 12px; }
  footer { border-top: 1px solid #1e293b; padding: 12px 18px; display: flex; gap: 10px; max-width: 900px; width: 100%; margin: 0 auto; }
  textarea { flex: 1; background:#0f172a; border:1px solid #1e293b; color:#e2e8f0; border-radius:8px; padding:10px; font:inherit; resize: vertical; min-height: 44px; max-height: 200px; }
  button { background: linear-gradient(90deg,#0891b2,#2563eb); border: 0; color: white; padding: 0 22px; border-radius: 8px; font: inherit; cursor: pointer; }
  button:disabled { opacity: .5; cursor: wait; }
</style>
</head>
<body>
<header>
  <b>XMINAL</b><span>EVERY CODING AGENT. ONE TERMINAL.</span>
  <input id="token" type="password" placeholder="Bearer token (optional — xminal serve --token)" autocomplete="off" />
</header>
<main id="chat"><div class="msg meta">Connected to this XMINAL server. Ask anything — the agent will stream its answer here.</div></main>
<footer>
  <textarea id="input" placeholder="Ask XMINAL…  (Enter to send, Shift+Enter for newline)"></textarea>
  <button id="send">Send</button>
</footer>
<script>
  const tokenEl = document.getElementById('token');
  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  tokenEl.value = sessionStorage.getItem('xminal-token') || '';
  tokenEl.addEventListener('input', () => sessionStorage.setItem('xminal-token', tokenEl.value));

  function add(role, text) {
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    el.textContent = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }
  function headers() {
    const h = { 'content-type': 'application/json' };
    if (tokenEl.value) h.authorization = 'Bearer ' + tokenEl.value;
    return h;
  }
  async function ask() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    add('user', text);
    const out = add('assistant', '');
    send.disabled = true;
    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ messages: [{ role: 'user', content: text }], stream: true }),
      });
      if (!res.ok) { out.textContent = 'HTTP ' + res.status + ' — ' + (await res.text()); return; }
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
            if (delta && delta.content) out.textContent += delta.content;
          } catch {}
        }
        chat.scrollTop = chat.scrollHeight;
      }
    } catch (err) {
      out.textContent = 'connection error: ' + err;
    } finally {
      send.disabled = false;
      input.focus();
    }
  }
  send.addEventListener('click', ask);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
  });
</script>
</body>
</html>
`;
