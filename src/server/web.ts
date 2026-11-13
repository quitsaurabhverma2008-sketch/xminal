/* XMINAL embedded web client (src/server/web.ts). The full page is a single self-contained HTML/JS app
   served at GET / (and /web) by `xminal serve` / `xminal web-ui`. Keep it dependency-free (no build step).
   Edit src/server/web.ts only via `scripts/rebuild-web.py` or by regenerating from the raw page. */
export const WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>XMINAL</title>
<style>
/* Pure Ink palette — same tokens as Ekko Studio (light) */
:root{--bg-primary:#fafafa;--bg-sidebar:#f5f5f5;--bg-card:#fff;--bg-hover:#fafafa;--border:#e0e0e0;--border-light:#ebebeb;
--acc:#333;--acc-rgb:51,51,51;--tx:#1a1a1a;--tx2:#666;--mu:#999;--ok:#2e7d32;--er:#c62828;--wa:#f57f17;--msg:#f5f5f5;--code:#f4f4f4;
--font:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
--r-sm:6px;--r-md:8px;--r-card:14px;--t:.15s ease}
*{box-sizing:border-box;margin:0}
html,body{height:100%}
body{font-family:var(--font);font-size:14px;color:var(--tx);background:var(--bg-sidebar);-webkit-font-smoothing:antialiased;overflow:hidden}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;border:1px solid var(--border);background:var(--bg-card);border-radius:var(--r-sm);padding:7px 14px;transition:var(--t);display:inline-flex;align-items:center;justify-content:center;gap:6px}
button:hover{background:rgba(var(--acc-rgb),.06)}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}
input,select,textarea{border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 12px;background:var(--bg-card);width:100%;transition:var(--t)}
input:hover,select:hover{border-color:rgba(var(--acc-rgb),.32)}
a{color:inherit;text-decoration:none}
svg{flex:none}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:#d4d4d4;border-radius:8px}::-webkit-scrollbar-thumb:hover{background:#bbb}
.wm{font-weight:700;letter-spacing:.14em;font-size:15px}

/* ---------- shell ---------- */
#app{display:flex;height:100dvh;background:var(--bg-sidebar)}
#rail{flex:0 0 64px;width:64px;display:flex;flex-direction:column;align-items:center;padding:12px 8px;min-height:0}
#rail .logo{width:36px;height:36px;border-radius:var(--r-md);background:var(--acc);color:#fff;display:grid;place-items:center;font-weight:800;font-size:15px;margin-bottom:14px}
#rail nav{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;width:100%}
#rail nav::-webkit-scrollbar{display:none}
#rail .bot{display:flex;flex-direction:column;gap:6px;padding-top:10px}
.rb{display:grid;place-items:center;flex:0 0 44px;width:44px;height:44px;color:var(--mu);border-radius:var(--r-sm);transition:var(--t)}
.rb:hover{color:var(--tx);background:rgba(var(--acc-rgb),.06)}
.rb.on{color:var(--acc);background:rgba(var(--acc-rgb),.12)}
#sbar{display:none;flex:0 0 240px;width:240px;flex-direction:column;min-height:0;padding:12px 8px 10px 0}
#sbar .sb-head{display:flex;align-items:center;justify-content:space-between;padding:6px 8px 10px}
.sb-new{width:100%;justify-content:flex-start;padding:9px 12px;margin-bottom:8px;font-weight:600}
.sb-search{position:relative;margin-bottom:8px}.sb-search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--mu)}.sb-search input{padding-left:32px;font-size:13px}
#sbl{flex:1;overflow:auto;min-height:0}
.sb-grp{font-size:11px;color:var(--mu);padding:10px 10px 4px;text-transform:uppercase;letter-spacing:.06em}
.si2{display:flex;align-items:center;gap:4px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;color:var(--tx2);margin-bottom:2px;transition:var(--t);position:relative}
.si2:hover{background:rgba(var(--acc-rgb),.06);color:var(--tx)}
.si2.on{background:rgba(var(--acc-rgb),.12);color:var(--tx);font-weight:500}
.si2 .tt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.si2 .tm{font-size:11px;color:var(--mu);flex:none}
.si2 .sa{display:none;gap:2px}.si2:hover .sa{display:flex}.si2:hover .tm{display:none}
.mini{border:0;background:none;padding:3px;color:var(--mu);border-radius:4px;line-height:0}
.mini:hover{color:var(--tx);background:rgba(var(--acc-rgb),.1)}.mini.arm{color:#fff;background:var(--er);padding:3px 6px;font-size:11px;line-height:1.2}
.sb-foot{border-top:1px solid var(--border);padding:10px 8px 0;font-size:11px;color:var(--mu);line-height:1.7}
.sb-foot b{color:var(--tx2);font-weight:600}
#main{flex:1;min-width:0;display:flex;flex-direction:column;margin:10px 10px 10px 0;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-card);box-shadow:0 8px 24px rgba(0,0,0,.08);overflow:hidden}
#top{flex:0 0 60px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid var(--border-light);min-width:0}
#top .title{font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:15px}
#top .menu{display:none}
#page{flex:1;overflow:auto;min-height:0}
.hdr-r{display:flex;align-items:center;gap:6px;flex:none}
.ibtn{width:34px;height:34px;padding:0;border-color:transparent;background:none;color:var(--tx2)}.ibtn:hover{color:var(--tx)}
.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:999px;padding:4px 11px;font-size:12px;color:var(--tx2);white-space:nowrap;transition:var(--t);max-width:100%}
a.chip:hover{background:rgba(var(--acc-rgb),.06);color:var(--tx)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--er);display:inline-block;flex:none}.dot.on{background:var(--ok)}
.btn-p{background:var(--acc);color:#fff;border-color:var(--acc);font-weight:600}.btn-p:hover{background:#1a1a1a}
.btn-ok{background:var(--ok);color:#fff;border-color:var(--ok)}.btn-ok:hover{background:#256528}
.btn-no{background:var(--er);color:#fff;border-color:var(--er)}.btn-no:hover{background:#a82020}
.btn-am{background:var(--wa);color:#fff;border-color:var(--wa)}.btn-am:hover{background:#d96c0f}
button:disabled{opacity:.45;cursor:not-allowed}

/* ---------- pages ---------- */
.wrap{max-width:820px;margin:0 auto;padding:26px 20px 60px}
h1{font-size:22px;font-weight:600;letter-spacing:-.4px;margin-bottom:6px}
h3{font-size:14px;font-weight:600}
.sub{color:var(--tx2);margin-bottom:18px;line-height:1.55;font-size:13px}
.card{border:1px solid var(--border);border-radius:var(--r-md);padding:14px;background:var(--bg-card);margin-bottom:12px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1;min-width:0}
.opt{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:14px;margin-bottom:10px;border-radius:var(--r-md);justify-content:flex-start}
.opt.sel{border-color:var(--acc);background:rgba(var(--acc-rgb),.05)}
.opt b{display:block;margin-bottom:3px;font-weight:600}.opt small{color:var(--tx2);line-height:1.45;font-size:12.5px;display:block}
.tag{font-size:11px;border-radius:4px;padding:2px 7px;background:#efefef;color:var(--tx2);white-space:nowrap}
.tag.free{background:rgba(46,125,50,.1);color:var(--ok)}.tag.paid{background:rgba(245,127,23,.12);color:#b45309}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:12px}
.stat{border:1px solid var(--border);border-radius:var(--r-md);padding:14px}.stat b{display:block;font-size:20px;margin-top:4px;font-weight:600}.stat span{color:var(--tx2);font-size:12px}
.bar{height:6px;border-radius:6px;background:#ebebeb;overflow:hidden}.bar i{display:block;height:100%;background:var(--acc)}
label.f{display:block;margin:16px 0 6px;font-weight:600;font-size:13px}

/* ---------- chat ---------- */
.cw{display:flex;flex-direction:column;height:100%}
#chatscroll{flex:1;overflow:auto;min-height:0}
#msgs{padding:20px 16px 8px;max-width:860px;margin:0 auto;width:100%}
.m{display:flex;gap:8px;margin-bottom:18px;min-width:0}
.m.u{justify-content:flex-end}
.m.u .bub{max-width:75%;display:flex;flex-direction:column;align-items:flex-end}
.m.u .mb{background:var(--msg);border-radius:10px;padding:10px 14px;white-space:pre-wrap;word-break:break-word;line-height:1.65}
.av{width:22px;height:22px;border-radius:50%;background:var(--acc);color:#fff;display:grid;place-items:center;font-size:10px;font-weight:700;flex:none;margin-top:2px}
.m.a .bub{max-width:80%;min-width:0;flex:0 1 auto}
.au{font-size:12px;color:var(--tx2);margin-bottom:6px;line-height:22px}
.m.a .mb{background:var(--msg);border-radius:10px;padding:10px 14px;line-height:1.65;word-break:break-word;overflow-wrap:anywhere;margin-bottom:6px}
.acts{display:flex;gap:2px;margin-top:4px;opacity:0;transition:var(--t)}.m:hover .acts{opacity:1}
@media(hover:none){.acts{opacity:1}}
.m.u .acts{justify-content:flex-end}
.md>:first-child{margin-top:0}.md>:last-child{margin-bottom:0}
.md h1,.md h2,.md h3,.md h4{margin:14px 0 6px;font-size:15px;font-weight:600}.md h1{font-size:18px}.md p{margin:6px 0}.md ul,.md ol{margin:6px 0 6px 22px}
.md table{border-collapse:collapse;margin:8px 0;display:block;overflow:auto}.md th,.md td{border:1px solid var(--border);padding:6px 10px}.md th{background:#efefef}
.md code.i{background:#e8e8e8;padding:1px 6px;border-radius:4px;font-family:var(--mono);font-size:12.5px}
.md a{text-decoration:underline}
.code{border:1px solid var(--border);border-radius:var(--r-sm);margin:8px 0;overflow:hidden;background:var(--code)}
.code .ch{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding:3px 6px 3px 10px;font-size:12px;color:var(--tx2);font-family:var(--mono)}
.code .ch button{padding:2px 8px;font-size:12px;border:0;background:none;color:var(--tx2)}
.code pre{padding:12px;overflow:auto;font-size:12.5px;line-height:1.55;font-family:var(--mono)}
.k{font-weight:700}.s{color:var(--ok)}.c{color:var(--mu);font-style:italic}.n{color:#b45309}
.tools{margin:4px 0 8px 11px;padding:3px 4px 3px 14px;border-left:1px solid rgba(var(--acc-rgb),.14);display:flex;flex-direction:column;gap:2px}
.tool{font-size:12.5px;color:var(--tx2)}
.tool summary{cursor:pointer;display:flex;gap:8px;align-items:center;padding:3px 0;list-style:none;min-width:0}
.tool summary::-webkit-details-marker{display:none}
.tool summary b{color:var(--tx);font-weight:600}.tool summary .ap{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--mono);font-size:11.5px}
.tool pre{padding:8px 10px;overflow:auto;max-height:240px;background:var(--code);border-radius:var(--r-sm);margin:2px 0 6px;white-space:pre-wrap;word-break:break-word;font-family:var(--mono);font-size:12px}
.tool.err pre.o{color:var(--er);background:rgba(198,40,40,.06)}.tool.err summary b{color:var(--er)}
.spin{width:12px;height:12px;border:2px solid #ddd;border-top-color:var(--acc);border-radius:50%;animation:sp .7s linear infinite;flex:none}
@keyframes sp{to{transform:rotate(360deg)}}
.reason{font-style:italic;color:var(--tx2);border-left:2px solid var(--border);padding:2px 10px;margin:6px 0;font-size:13px}
.stat-msg{font-size:12px;color:var(--tx2);background:var(--bg-primary);border:1px dashed var(--border);border-radius:var(--r-sm);padding:5px 10px;margin:6px 0}
.errc{border:1px solid rgba(198,40,40,.25);background:rgba(198,40,40,.06);border-radius:10px;padding:10px 12px;margin:6px 0;color:var(--er);display:flex;gap:10px;align-items:center;justify-content:space-between}
.errc button{border-color:rgba(198,40,40,.3);color:var(--er);background:#fff}
.intro{text-align:center;padding:0 20px 18px}.intro h1{font-size:clamp(22px,2.4vw,30px);letter-spacing:-.6px;margin:0 0 8px}.intro p{color:var(--tx2);font-size:13px}
.chips{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px}.chips button{border-radius:999px;color:var(--tx2);font-size:13px}
#comp{flex:none;padding:6px 12px 10px;position:relative}
#compin{max-width:760px;margin:0 auto;position:relative}
#box{border:1px solid var(--border);border-radius:var(--r-card);padding:8px 10px;background:var(--bg-card);display:flex;flex-direction:column;gap:4px;transition:var(--t);box-shadow:0 1px 2px rgba(0,0,0,.03)}
#box:focus-within{border-color:rgba(var(--acc-rgb),.5)}
.ptop{display:flex;gap:2px;align-items:center;overflow-x:auto;scrollbar-width:none;flex-wrap:nowrap}.ptop::-webkit-scrollbar{display:none}
.pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 9px;font-size:12px;color:var(--tx2);white-space:nowrap;flex:none;max-width:190px;transition:var(--t)}
.pill:hover{background:rgba(var(--acc-rgb),.07);color:var(--tx)}.pill span{overflow:hidden;text-overflow:ellipsis}
#ta{border:0;resize:none;padding:6px 4px;max-height:240px;outline:none;background:none;line-height:1.55}
#ta:focus-visible{outline:none}
#cbar{display:flex;align-items:center;gap:2px}
#cbar .ct{margin-left:auto;font-size:11px;color:var(--mu);margin-right:8px}
.send{width:34px;height:34px;padding:0;border-radius:50%;background:var(--acc);color:#fff;border-color:var(--acc)}.send:hover{background:#1a1a1a}.send.stop{background:var(--er);border-color:var(--er)}
#slash{position:absolute;left:0;right:0;bottom:calc(100% + 6px);background:var(--bg-card);border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.1);max-height:260px;overflow:auto;display:none;z-index:20}
.si{padding:9px 12px;display:flex;gap:10px;cursor:pointer;align-items:baseline}.si.on,.si:hover{background:rgba(var(--acc-rgb),.06)}.si small{color:var(--mu)}
.cw.empty{justify-content:center;padding-bottom:6vh}.cw.empty #chatscroll{flex:none;overflow:visible}.cw.empty #msgs{padding:0}
.cw.empty #comp{width:100%}

/* overlay */
#ov{position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;align-items:flex-start;justify-content:center;padding:10vh 12px;z-index:50}
#ov.show{display:flex}
#ovc{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-card);width:100%;max-width:620px;max-height:76vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.2)}
#ovc .l{overflow:auto}
#drawer{position:fixed;inset:0;z-index:40;display:none}
#drawer.show{display:block}
#drawer .bk{position:absolute;inset:0;background:rgba(0,0,0,.35)}
#drawer .pn{position:absolute;left:0;top:0;bottom:0;width:min(290px,84vw);background:var(--bg-sidebar);padding:14px 10px;overflow:auto;display:flex;flex-direction:column;gap:2px}
#drawer .pn a{display:flex;gap:12px;align-items:center;padding:11px 12px;border-radius:var(--r-sm);color:var(--tx2)}
#drawer .pn a.on{background:rgba(var(--acc-rgb),.12);color:var(--tx);font-weight:500}

/* responsive — same breakpoints idea as Ekko (768 mobile) */
@media(min-width:1000px){body[data-route=chat] #sbar{display:flex}}
@media(max-width:767px){
 #rail{display:none}#main{margin:0;border:0;border-radius:0;box-shadow:none}
 #top{padding:0 10px;flex-basis:54px}#top .menu{display:inline-flex}
 .m.a .bub{max-width:calc(100% - 30px)}.m.u .bub{max-width:88%}
 .hide-m{display:none!important}.pill{max-width:130px}.wrap{padding:20px 14px 50px}
 #comp{padding:4px 8px calc(8px + env(safe-area-inset-bottom))}
}
</style>
</head>
<body>
<div id="app">
  <aside id="rail"></aside>
  <aside id="sbar"></aside>
  <section id="main"><header id="top"></header><div id="page"></div></section>
</div>
<div id="drawer"><div class="bk" data-act="menuclose"></div><div class="pn" id="dpn"></div></div>
<div id="ov"><div id="ovc"></div></div>

<script>
/* ============ helpers ============ */
const $=(s,e=document)=>e.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}};
const sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const uid=()=>'l'+Math.random().toString(36).slice(2,10);
const fmtD=t=>t?new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const fmtS=t=>{if(!t)return '';const d=new Date(t),n=new Date();return d.toDateString()===n.toDateString()?d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([], {month:'short',day:'numeric'})};
const fmtCtx=n=>!n?'—':n>=1e6?(n/1e6).toFixed(1)+'M':Math.round(n/1e3)+'k';
const copy=async t=>{try{await navigator.clipboard.writeText(t);toast('Copied')}catch{toast('Copy failed')}};
function toast(t){const e=document.createElement('div');e.textContent=t;e.style.cssText='position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:8px 14px;border-radius:8px;z-index:99;font-size:13px';document.body.append(e);setTimeout(()=>e.remove(),1600)}
const IC={chat:'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',sessions:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',models:'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
mode:'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',effort:'M13 2 3 14h9l-1 8 10-12h-9l1-8z',permissions:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',approvals:'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
usage:'M3 12h4v9H3zM10 7h4v14h-4zM17 3h4v18h-4z',status:'M22 12h-4l-3 9L9 3l-3 9H2',commands:'M4 17l6-6-6-6M12 19h8',export:'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
settings:'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',about:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',menu:'M4 6h16M4 12h16M4 18h16',plus:'M12 5v14M5 12h14',search:'M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
trash:'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',pin:'M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z',edit:'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
clip:'M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8',mic:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',up:'M12 19V5M5 12l7-7 7 7',
stop:'M7 7h10v10H7z',chev:'M6 9l6 6 6-6',copy:'M9 9h11v11H9zM5 15H4V4h11v1',wrench:'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z',
file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',globe:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20',list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
x:'M18 6 6 18M6 6l12 12',thumbup:'M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 8a2 2 0 0 1-1.9 1.5H7V10l4.1-8A2.4 2.4 0 0 1 15 4z',thumbdown:'M17 14V2M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.5l2.3-8A2 2 0 0 1 6.5 2H17v12l-4.1 8A2.4 2.4 0 0 1 9 20z',
refresh:'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',check:'M20 6 9 17l-5-5',back:'M19 12H5M12 19l-7-7 7-7',cmdk:'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z'};
const ic=(n,z=18)=>\`<svg width="\${z}" height="\${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="\${IC[n]||''}"/></svg>\`;

/* ============ state ============ */
const DEF={model:'',mode:'build',effort:'medium',perm:'ask',host:location.protocol.startsWith('http')?location.origin:'http://127.0.0.1:8787',token:''};
const S={cfg:{...DEF,...ls('x.cfg',{})},sessions:ls('x.sessions',{}),cur:ls('x.cur',null),models:[],providers:[],online:false,version:'',gen:false,abort:null,approvals:[],apprLog:ls('x.apprLog',[]),always:ls('x.always',[]),spend:ls('x.spend',[]),srv:[],q:''};
const save=()=>{sv('x.cfg',S.cfg);sv('x.sessions',S.sessions);sv('x.cur',S.cur);sv('x.spend',S.spend);sv('x.apprLog',S.apprLog);sv('x.always',S.always)};
const MODES={plan:['Plan','Read-only analysis. No files are changed.'],build:['Build','Implements changes in your project.'],compose:['Compose','Plan → implement → verify → review.'],review:['Review','Read-only code review.'],yolo:['Yolo','Fully autonomous. No stops.']};
const EFFORTS={low:['Low','Short answers, fastest.',1024],medium:['Medium','Balanced.',4096],high:['High','Long, careful output.',16384],max:['Max','Maximum output tokens per turn.',64000]};
const PERMS={ask:['Ask','Confirm risky actions with an approval card.'],auto:['Auto','Permit actions, with approval UI for sensitive ones.'],full:['Full','No confirmations (yolo).']};
const COMMANDS=[['mode','Change mode'],['model','Change model'],['variant','Change effort'],['compact','Compact the context'],['clear','Clear the chat'],['verify','Verify changes'],['map','Show repo map'],['diff','Show diff'],['constitution','Show constitution'],['spec','Show spec'],['skills','List skills'],['mcp','List MCP servers'],['tools','List tools'],['cost','Open usage'],['audit','Run audit'],['status','Connection status'],['help','All commands']];
const PAGES=[['chat','Chat'],['sessions','Sessions'],['models','Model'],['mode','Mode'],['effort','Effort'],['permissions','Permissions'],['approvals','Approvals'],['usage','Usage'],['status','Connection'],['commands','Commands'],['export','Share / Export'],['settings','Settings'],['about','About']];
const BOTTOM=['settings','about'];

const cs=()=>S.sessions[S.cur];
function newSession(){const id=uid();S.sessions[id]={id,title:'New chat',msgs:[],pinned:false,createdAt:Date.now(),updatedAt:Date.now(),cost:0,inT:0,outT:0,turns:0,lastIn:0,local:true};S.cur=id;save();return S.sessions[id]}
if(!cs())newSession();

/* ============ api ============ */
const H=()=>({'Content-Type':'application/json',...(S.cfg.token?{Authorization:'Bearer '+S.cfg.token}:{})});
const api=(p,o={})=>fetch(S.cfg.host.replace(/\\/$/,'')+p,{...o,headers:{...H(),...(o.headers||{})}});
async function health(){try{const r=await api('/health');const j=await r.json();S.online=j.status==='ok';S.version=j.version||''}catch{S.online=false}paintConn()}
async function loadModels(){try{const j=await(await api('/v1/models')).json();S.models=j.data||[];S.providers=j.providers||[];if(!S.cfg.model&&S.models[0]){S.cfg.model=S.models[0].id;save()}}catch{}}
async function loadSessions(){try{const j=await(await api('/v1/sessions')).json();S.srv=j.data||[];for(const s of S.srv){const l=S.sessions[s.id]||(S.sessions[s.id]={id:s.id,msgs:[],pinned:false,cost:0,inT:0,outT:0,turns:0,lastIn:0});l.title=l.title&&l.title!=='New chat'?l.title:(s.title||'Session');l.count=s.messageCount;l.updatedAt=Date.parse(s.updatedAt)||l.updatedAt;l.createdAt=Date.parse(s.createdAt)||l.createdAt}save()}catch{}}

/* ============ markdown ============ */
function hl(code){const c=esc(code);const kw='\\\\b(const|let|var|function|return|if|else|for|while|import|from|export|class|new|async|await|def|in|is|not|and|or|True|False|None|null|undefined|true|false|try|catch|throw|fi|then|do|done|echo|type|interface|public|private|static|void|int|string)\\\\b';
return c.replace(new RegExp('(\\\\/\\\\/.*|#.*$)|(&quot;.*?&quot;|&#39;.*?&#39;|\`[^\`]*\`)|'+kw+'|\\\\b(\\\\d+(?:\\\\.\\\\d+)?)\\\\b','gm'),(m,cm,st,kk,nn)=>cm?\`<span class="c">\${cm}</span>\`:st?\`<span class="s">\${st}</span>\`:kk?\`<span class="k">\${kk}</span>\`:\`<span class="n">\${nn}</span>\`)}
function inline(t){return esc(t).replace(/\`([^\`]+)\`/g,'<code class="i">$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<b>$1</b>').replace(/(^|[^*])\\*([^*\\n]+)\\*/g,'$1<i>$2</i>').replace(/\\[([^\\]]+)\\]\\((https?:[^)]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')}
function md(src){const blocks=[];const s=src.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)(\`\`\`|$)/g,(m,l,c)=>{blocks.push([l,c.replace(/\\n$/,'')]);return \`\\u0000\${blocks.length-1}\\u0000\`});
const lines=s.split('\\n');let out='',i=0;
while(i<lines.length){const L=lines[i];let m;
 if(m=L.match(/^\\u0000(\\d+)\\u0000$/)){const[l,c]=blocks[+m[1]];out+=\`<div class="code"><div class="ch"><span>\${esc(l||'text')}</span><button data-act="copycode">Copy</button></div><pre><code>\${hl(c)}</code></pre></div>\`;i++}
 else if(m=L.match(/^(#{1,4})\\s+(.*)/)){out+=\`<h\${m[1].length}>\${inline(m[2])}</h\${m[1].length}>\`;i++}
 else if(/^\\s*[-*]\\s+/.test(L)){let li='';while(i<lines.length&&/^\\s*[-*]\\s+/.test(lines[i]))li+=\`<li>\${inline(lines[i++].replace(/^\\s*[-*]\\s+/,''))}</li>\`;out+=\`<ul>\${li}</ul>\`}
 else if(/^\\s*\\d+\\.\\s+/.test(L)){let li='';while(i<lines.length&&/^\\s*\\d+\\.\\s+/.test(lines[i]))li+=\`<li>\${inline(lines[i++].replace(/^\\s*\\d+\\.\\s+/,''))}</li>\`;out+=\`<ol>\${li}</ol>\`}
 else if(L.includes('|')&&/^\\s*\\|?\\s*:?-{2,}/.test(lines[i+1]||'')){const row=r=>r.replace(/^\\s*\\||\\|\\s*$/g,'').split('|').map(x=>x.trim());const hd=row(L);i+=2;let b='';while(i<lines.length&&lines[i].includes('|'))b+='<tr>'+row(lines[i++]).map(x=>\`<td>\${inline(x)}</td>\`).join('')+'</tr>';out+=\`<table><tr>\${hd.map(x=>\`<th>\${inline(x)}</th>\`).join('')}</tr>\${b}</table>\`}
 else if(!L.trim())i++;
 else{const p=[];while(i<lines.length&&lines[i].trim()&&!/^(#{1,4}\\s|\\s*[-*]\\s|\\s*\\d+\\.\\s|\\u0000)/.test(lines[i]))p.push(lines[i++]);if(!p.length)p.push(lines[i++]);out+=\`<p>\${inline(p.join('\\n')).replace(/\\n/g,'<br>')}</p>\`}}
return out}
let katexTried=false;
function math(el){if(!/\\$[^$]+\\$/.test(el.textContent))return;const go=()=>{try{renderMathInElement(el,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})}catch{}};
 if(window.renderMathInElement)return go();if(katexTried)return;katexTried=true;
 const l=document.createElement('link');l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';document.head.append(l);
 const a=document.createElement('script');a.src='https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';a.onload=()=>{const b=document.createElement('script');b.src='https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js';b.onload=()=>{katexTried=false;go()};document.head.append(b)};document.head.append(a)}

/* ============ shell ============ */
let route='chat';
const TITLES=Object.fromEntries(PAGES);TITLES.more='All pages';
function railItem(k){const t=TITLES[k];return \`<a class="rb \${route===k?'on':''}" href="#/\${k}" title="\${t}" aria-label="\${t}">\${ic(k,22)}</a>\`}
function paintRail(){
 $('#rail').innerHTML=\`<div class="logo">X</div><nav>\${PAGES.filter(p=>!BOTTOM.includes(p[0])).map(p=>railItem(p[0])).join('')}</nav><div class="bot">\${BOTTOM.map(railItem).join('')}</div>\`;
 $('#dpn').innerHTML=\`<div class="wm" style="padding:8px 12px 12px">XMINAL</div>\`+PAGES.map(([k,t])=>\`<a href="#/\${k}" class="\${route===k?'on':''}" data-act="menuclose">\${ic(k,20)}<span>\${t}</span></a>\`).join('')}
function paintSide(){const sb=$('#sbar');if(route!=='chat'){sb.innerHTML='';return}
 sb.innerHTML=\`<div class="sb-head"><span class="wm">XMINAL</span></div><button class="sb-new" data-act="new">\${ic('plus',16)} New chat</button>
 <div class="sb-search">\${ic('search',15)}<input id="sbq" placeholder="Search sessions" value="\${esc(S.q)}"></div><div id="sbl"></div><div class="sb-foot" id="sbf"></div>\`;
 $('#sbq').oninput=e=>{S.q=e.target.value;drawSide()};drawSide()}
function sessRow(s){return \`<div class="si2 \${s.id===S.cur?'on':''}" data-id="\${s.id}" data-act="open"><span class="tt">\${s.pinned?ic('pin',12)+' ':''}\${esc(s.title||'Untitled')}</span><span class="tm">\${fmtS(s.updatedAt)}</span><span class="sa"><button class="mini" data-act="pin" title="Pin">\${ic('pin',14)}</button><button class="mini" data-act="rename" title="Rename">\${ic('edit',14)}</button><button class="mini" data-act="del" title="Delete">\${ic('trash',14)}</button></span></div>\`}
function drawSide(){const el=$('#sbl');if(!el)return;const q=S.q.toLowerCase();
 const all=Object.values(S.sessions).filter(s=>!q||(s.title||'').toLowerCase().includes(q)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 const pin=all.filter(s=>s.pinned),rest=all.filter(s=>!s.pinned);
 el.innerHTML=(pin.length?\`<div class="sb-grp">Pinned</div>\${pin.map(sessRow).join('')}\`:'')+\`<div class="sb-grp">Sessions</div>\`+(rest.map(sessRow).join('')||'<div class="sub" style="padding:6px 10px">Nothing here yet.</div>');
 const w=Date.now(),sum=ms=>S.spend.filter(x=>w-x.t<ms).reduce((a,b)=>a+b.c,0),s=cs();
 $('#sbf').innerHTML=\`\${S.providers.length||'—'} providers · \${S.models.length||'—'} models<br>This chat <b>$\${s.cost.toFixed(4)}</b> · week <b>$\${sum(6048e5).toFixed(2)}</b> · month <b>$\${sum(2592e6).toFixed(2)}</b>\`}
function paintConn(){document.querySelectorAll('.conn').forEach(e=>e.innerHTML=\`<span class="dot \${S.online?'on':''}"></span><span class="hide-m">\${S.online?'local server online':'reconnecting…'}</span>\`)}
function paintTop(){const s=cs();
 const ctxw=(S.models.find(m=>m.id===S.cfg.model)||{}).context_window||0;
 const menu=\`<button class="ibtn menu" data-act="menuopen" aria-label="Menu">\${ic('menu',20)}</button>\`;
 $('#top').innerHTML=menu+(route==='chat'?\`<div class="title">\${esc(s.title)}</div><div class="hdr-r">
  <a class="chip hide-m" href="#/usage" title="Usage">\${s.turns} turns · \${s.inT+s.outT} tok · $\${s.cost.toFixed(4)}\${ctxw?\` · \${Math.min(100,Math.round(s.lastIn/ctxw*100))}% ctx\`:''}</a>
  <a class="chip conn" href="#/status"></a>
  <button id="stopb" class="btn-no" data-act="stop" style="display:\${S.gen?'':'none'};padding:5px 10px">\${ic('stop',14)} Stop</button>
  <a class="ibtn rb" style="width:34px;height:34px;flex:none" href="#/export" title="Share / Export">\${ic('export',18)}</a>
  <button class="ibtn" data-act="new" title="New chat (Ctrl+N)">\${ic('plus',20)}</button></div>\`
 :\`<div class="title">\${TITLES[route]||''}</div><div class="hdr-r"><a class="chip conn" href="#/status"></a></div>\`);paintConn()}
function nav(){route=(location.hash.replace(/^#\\//,'')||'chat').split('?')[0];if(!PAGES.some(p=>p[0]===route)&&route!=='more')route='chat';document.body.dataset.route=route;
 paintRail();paintSide();paintTop();const p=$('#page');p.innerHTML='';p.style.cssText='';(R[route]||R.chat)(p)}
window.addEventListener('hashchange',nav);

/* ============ pages ============ */
const wrap=(t,sub,body)=>\`<div class="wrap"><h1>\${t}</h1><div class="sub">\${sub}</div>\${body}</div>\`;
const R={};

/* --- chat --- */
R.chat=p=>{p.style.overflow='hidden';
 p.innerHTML=\`<div class="cw" id="cw"><div id="chatscroll"><div id="msgs"></div></div>
 <div id="comp"><div id="slash"></div><div id="compin"><div id="box"><div id="files" class="row"></div>
 <div class="ptop"><a class="pill" href="#/models" title="Model">\${ic('models',14)}<span>\${esc(S.cfg.model||'pick model')}</span></a><a class="pill" href="#/mode" title="Mode">\${ic('mode',14)}<span>\${S.cfg.mode}</span></a><a class="pill" href="#/effort" title="Effort">\${ic('effort',14)}<span>\${S.cfg.effort}</span></a><a class="pill" href="#/permissions" title="Permission mode">\${ic('permissions',14)}<span>\${S.cfg.perm}</span></a></div>
 <textarea id="ta" rows="1" placeholder="Message XMINAL…  ( / for commands )"></textarea>
 <div id="cbar"><button class="ibtn" data-act="attach" title="Attach file">\${ic('clip',18)}</button><button class="ibtn" data-act="mic" title="Voice input" id="micb">\${ic('mic',18)}</button><button class="ibtn" data-act="palette" title="Command palette (Ctrl+K)">\${ic('cmdk',17)}</button><span class="ct" id="ct">0 chars · ~0 tok</span><button id="sendb" class="send" data-act="send" aria-label="Send">\${ic('up',18)}</button></div></div></div><input type="file" id="fi" multiple hidden></div></div>\`;
 renderMsgs(true);bindComposer();paintSend();setTimeout(()=>{const t=$('#ta');t&&t.focus()},50)};
const toBottom=()=>{const r=$('#chatscroll');if(r)r.scrollTop=r.scrollHeight};
const GL={bash:'wrench',read:'file',edit:'edit',write:'edit',grep:'search',glob:'search',web:'globe',webfetch:'globe',websearch:'globe',todo:'list',todowrite:'list'};
function partsHtml(parts){let out='',i=0;while(i<parts.length){const x=parts[i];
 if(x.type==='tool'){let g='';while(i<parts.length&&parts[i].type==='tool')g+=toolHtml(parts[i++]);out+=\`<div class="tools">\${g}</div>\`;continue}
 out+=partHtml(x);i++}return out}
function toolHtml(x){const g=GL[(x.name||'').toLowerCase()]||'wrench';const a=typeof x.args==='string'?x.args:JSON.stringify(x.args,null,2);
 return \`<details class="tool \${x.err?'err':''}"><summary>\${x.done?ic(g,14):'<span class="spin"></span>'}<b>\${esc(x.name)}</b><span class="ap">\${esc((a||'').replace(/\\s+/g,' ').slice(0,90))}</span><span class="tag">\${x.dur?x.dur+'s':'…'}</span></summary><pre>\${esc(a)}</pre>\${x.out!=null?\`<pre class="o">\${esc(x.out)}</pre>\`:''}</details>\`}
function partHtml(x){
 if(x.type==='text')return \`<div class="md mb">\${md(x.text)}</div>\`;
 if(x.type==='reasoning')return \`<details class="reason"><summary>Thinking…</summary>\${esc(x.text).replace(/\\n/g,'<br>')}</details>\`;
 if(x.type==='status')return \`<div class="stat-msg">\${esc(x.text)}</div>\`;
 if(x.type==='error')return \`<div class="errc"><span>\${esc(x.text)}</span><button data-act="retry">\${ic('refresh',14)} Retry</button></div>\`;return ''}
let rafP=0;function renderMsgs(now){if(rafP&&!now)return;const run=()=>{rafP=0;const el=$('#msgs');if(!el)return;const s=cs();$('#cw').classList.toggle('empty',!s.msgs.length);
 if(!s.msgs.length){el.innerHTML=\`<div class="intro"><h1>What should XMINAL build?</h1><p>Local agent workspace · \${esc(S.cfg.model||'no model selected')}</p><div class="chips"><button data-act="chip" data-t="explain this codebase">explain this codebase</button><button data-act="chip" data-t="fix the failing test">fix the failing test</button><button data-act="chip" data-t="review this diff">review this diff</button></div></div>\`;return}
 const ab=(t,i,k)=>\`<button class="ibtn" style="width:28px;height:28px" data-act="\${t}" title="\${k}">\${ic(i,14)}</button>\`;
 el.innerHTML=s.msgs.map((m,i)=>m.role==='user'?\`<div class="m u" data-i="\${i}"><div class="bub"><div class="mb">\${esc(m.text)}</div><div class="acts">\${ab('copymsg','copy','Copy')}\${ab('editmsg','edit','Edit & resend')}\${ab('delmsg','trash','Delete')}</div></div></div>\`
 :\`<div class="m a" data-i="\${i}"><div class="av">X</div><div class="bub"><div class="au">XMINAL\${S.cfg.model?' · '+esc(S.cfg.model):''}</div>\${partsHtml(m.parts)||(S.gen&&i===s.msgs.length-1?'<span class="spin"></span>':'')}<div class="acts">\${ab('copymsg','copy','Copy')}\${ab('regen','refresh','Regenerate')}\${ab('up','thumbup','Good')}\${ab('down','thumbdown','Bad')}\${ab('delmsg','trash','Delete')}</div></div></div>\`).join('');
 el.querySelectorAll('.md').forEach(math);toBottom()};
 if(now){run()}else rafP=requestAnimationFrame(run)}
function paintSend(){const b=$('#sendb');if(b){b.innerHTML=ic(S.gen?'stop':'up',S.gen?16:18);b.dataset.act=S.gen?'stop':'send';b.className='send'+(S.gen?' stop':'');b.setAttribute('aria-label',S.gen?'Stop':'Send')}const sb=$('#stopb');if(sb)sb.style.display=S.gen?'':'none'}
let attach=[];
function paintFiles(){const f=$('#files');if(f)f.innerHTML=attach.map((a,i)=>\`<span class="chip">\${ic('clip',12)} \${esc(a.name)} <a href="javascript:void 0" data-act="rmfile" data-i="\${i}" style="line-height:0">\${ic('x',12)}</a></span>\`).join('')}
const fuzzy=(t,q)=>{t=t.toLowerCase();q=q.toLowerCase();let j=0;for(const c of t){if(c===q[j])j++}return j===q.length};
function bindComposer(){const ta=$('#ta'),sl=$('#slash');let idx=0,items=[];
 const upd=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,240)+'px';$('#ct').textContent=\`\${ta.value.length} chars · ~\${Math.ceil(ta.value.length/4)} tok\`;
  const v=ta.value;if(/^\\/\\S*$/.test(v)){const q=v.slice(1).toLowerCase();items=COMMANDS.filter(c=>fuzzy(c[0],q));idx=0;sl.style.display=items.length?'block':'none';drawSl()}else sl.style.display='none'};
 const drawSl=()=>sl.innerHTML=items.map((c,i)=>\`<div class="si \${i===idx?'on':''}" data-act="slashpick" data-n="\${c[0]}"><b>/\${c[0]}</b><small>\${c[1]}</small></div>\`).join('');
 ta.addEventListener('input',upd);
 ta.addEventListener('keydown',e=>{const open=sl.style.display==='block';
  if(open&&e.key==='ArrowDown'){e.preventDefault();idx=(idx+1)%items.length;drawSl()}
  else if(open&&e.key==='ArrowUp'){e.preventDefault();idx=(idx-1+items.length)%items.length;drawSl()}
  else if(open&&e.key==='Tab'){e.preventDefault();ta.value='/'+items[idx][0]+' ';upd()}
  else if(open&&e.key==='Enter'){e.preventDefault();ta.value='';sl.style.display='none';runCmd(items[idx][0])}
  else if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}
  else if(e.key==='Escape'){sl.style.display='none'}});
 $('#fi').onchange=async e=>{for(const f of e.target.files){if(f.size>2e6){toast(f.name+' too large (2MB max)');continue}attach.push({name:f.name,text:await f.text()})}paintFiles();e.target.value=''};
 const box=$('#box');box.addEventListener('dragover',e=>e.preventDefault());box.addEventListener('drop',async e=>{e.preventDefault();for(const f of e.dataTransfer.files){attach.push({name:f.name,text:await f.text()})}paintFiles()});
 paintFiles()}
function runCmd(n,arg){const go=h=>{location.hash='#/'+h};
 if(n==='mode')return go('mode');if(n==='model')return go('models');if(n==='variant')return go('effort');if(n==='cost')return go('usage');if(n==='status')return go('status');if(n==='help')return go('commands');
 if(n==='clear')return clearChat();
 const el=$('#ta');if(el){el.value='/'+n+(arg?' '+arg:'');send()}else{location.hash='#/chat';setTimeout(()=>{const t=$('#ta');if(t){t.value='/'+n;send()}},80)}}
function clearChat(){const s=cs();s.msgs=[];save();nav()}

/* --- sending / streaming --- */
async function send(text,keep){
 if(S.gen)return;const ta=$('#ta');text=(text??(ta?ta.value:'')).trim();if(!text&&!attach.length)return;
 const s=cs();let full=text;if(attach.length){full+='\\n\\n'+attach.map(a=>\`--- file: \${a.name} ---\\n\${a.text}\`).join('\\n\\n')}
 if(!keep){s.msgs.push({role:'user',text:text+(attach.length?\`\\n[attached: \${attach.map(a=>a.name).join(', ')}]\`:'')});if(s.title==='New chat')s.title=text.slice(0,40)}
 attach=[];paintFiles();if(ta){ta.value='';ta.style.height='auto';$('#ct').textContent='0 chars · ~0 tok'}
 const a={role:'assistant',parts:[]};s.msgs.push(a);S.gen=true;S.abort=new AbortController();paintSend();paintTop();renderMsgs(true);drawSide();s.lastText=full;
 const txt=()=>{let l=a.parts[a.parts.length-1];if(!l||l.type!=='text')a.parts.push(l={type:'text',text:''});return l};
 try{
  const r=await api('/v1/agent/stream',{method:'POST',signal:S.abort.signal,body:JSON.stringify({sessionId:s.local?undefined:s.id,message:full,prompt:full,model:S.cfg.model,mode:S.cfg.mode,effort:S.cfg.effort,maxTokens:EFFORTS[S.cfg.effort][2],permissionMode:S.cfg.perm})});
  if(!r.ok||!r.body)throw new Error('Server responded '+r.status);
  const rd=r.body.getReader(),dec=new TextDecoder();let buf='';
  while(true){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let k;
   while((k=buf.search(/\\r?\\n\\r?\\n/))>=0){const blk=buf.slice(0,k);buf=buf.slice(k).replace(/^\\r?\\n\\r?\\n/,'');let ev='message',d='';
    for(const ln of blk.split(/\\r?\\n/)){if(ln.startsWith('event:'))ev=ln.slice(6).trim();else if(ln.startsWith('data:'))d+=ln.slice(5).trim()}
    let j={};try{j=JSON.parse(d||'{}')}catch{j={text:d}}handle(ev,j,a,s,txt);renderMsgs()}}
 }catch(e){if(e.name!=='AbortError')a.parts.push({type:'error',text:e.message||'Connection failed'});else a.parts.push({type:'status',text:'Stopped'})}
 S.gen=false;S.abort=null;s.updatedAt=Date.now();save();paintSend();paintTop();renderMsgs(true);drawSide()}
function handle(ev,j,a,s,txt){
 if(ev==='session'){if(j.sessionId&&j.sessionId!==s.id){delete S.sessions[s.id];s.id=j.sessionId;s.local=false;S.sessions[s.id]=s;S.cur=s.id}}
 else if(ev==='status')a.parts.push({type:'status',text:j.message});
 else if(ev==='reasoning'){let l=a.parts[a.parts.length-1];if(!l||l.type!=='reasoning')a.parts.push(l={type:'reasoning',text:''});l.text+=j.text||''}
 else if(ev==='text')txt().text+=j.text||'';
 else if(ev==='tool_call')a.parts.push({type:'tool',id:j.id,name:j.name,args:j.arguments,t0:Date.now(),done:false});
 else if(ev==='tool_result'){const t=[...a.parts].reverse().find(x=>x.type==='tool'&&!x.done&&x.name===j.name);if(t){t.done=true;t.out=typeof j.content==='string'?j.content:JSON.stringify(j.content,null,2);t.err=!!j.isError;t.dur=((Date.now()-t.t0)/1000).toFixed(1)}}
 else if(ev==='permission'||ev==='permission_request'||ev==='approval'){const q={id:j.id,name:j.name||j.tool,args:j.arguments||j.args||j.command,risk:j.risk||'medium',reason:j.reason||'This action needs your approval',at:Date.now()};if(S.always.includes(q.name)){decide(q,'approve')}else{S.approvals.push(q);showApproval()}}
 else if(ev==='usage'){if(j.usage&&(j.usage.inputTokens||j.usage.input_tokens))s.lastIn=j.usage.inputTokens||j.usage.input_tokens;paintTop()}
 else if(ev==='done'){s.turns=j.turns??s.turns+1;const dc=j.costUsd||0,di=j.inputTokens||0,dOut=j.outputTokens||0;s.cost+=dc;s.inT+=di;s.outT+=dOut;if(j.inputTokens)s.lastIn=j.inputTokens;if(dc)S.spend.push({t:Date.now(),c:dc});if(j.stoppedReason&&!['end_turn','stop'].includes(j.stoppedReason))a.parts.push({type:'status',text:'Stopped: '+j.stoppedReason});paintTop()}
 else if(ev==='error')a.parts.push({type:'error',text:j.message||'Error'})}
async function decide(q,d,always){try{await api('/v1/agent/permission',{method:'POST',body:JSON.stringify({id:q.id,decision:d,approve:d==='approve',always:!!always})})}catch{}
 if(always&&!S.always.includes(q.name))S.always.push(q.name);
 S.apprLog.unshift({...q,decision:d+(always?' (always)':''),done:Date.now()});S.apprLog=S.apprLog.slice(0,100);S.approvals=S.approvals.filter(x=>x!==q);save();showApproval();if(route==='approvals')nav()}
function showApproval(){const q=S.approvals[0];const ov=$('#ov');if(!q){if(ov.dataset.k==='appr'){ov.classList.remove('show');ov.dataset.k=''}return}
 ov.dataset.k='appr';ov.classList.add('show');const col={high:'var(--er)',medium:'var(--wa)',low:'var(--ok)'}[q.risk]||'var(--wa)';
 $('#ovc').innerHTML=\`<div style="padding:18px"><h1 style="font-size:18px">Approval needed</h1><div class="sub">\${esc(q.reason)}</div>
 <div class="card" style="border-left:4px solid \${col}"><b style="color:\${col};font-size:12px">\${esc(String(q.risk).toUpperCase())} RISK</b><br><b>\${esc(q.name)}</b><pre style="white-space:pre-wrap;word-break:break-word;margin-top:8px;font-size:12.5px;font-family:var(--mono)">\${esc(typeof q.args==='string'?q.args:JSON.stringify(q.args,null,2))}</pre></div>
 <div class="row"><button class="btn-ok" data-act="appr" data-d="approve">Approve</button><button class="btn-no" data-act="appr" data-d="deny">Deny</button><button class="btn-am" data-act="appr" data-d="always">Approve &amp; always allow</button></div>\${S.approvals.length>1?\`<div class="sub" style="margin:10px 0 0">\${S.approvals.length-1} more waiting</div>\`:''}</div>\`}

/* --- sessions page --- */
R.sessions=p=>{p.innerHTML=wrap('Sessions','Search, pin, rename, switch, delete.',\`<div class="row" style="margin-bottom:14px"><input id="sq" class="grow" placeholder="Search sessions…" value="\${esc(S.q)}"><button class="btn-p" data-act="new">\${ic('plus',16)} New chat</button></div><div id="sl"></div>\`);
 $('#sq').oninput=e=>{S.q=e.target.value;drawSessions()};drawSessions();loadSessions().then(()=>route==='sessions'&&drawSessions())};
function drawSessions(){const el=$('#sl');if(!el)return;const q=S.q.toLowerCase();
 const all=Object.values(S.sessions).filter(s=>!q||(s.title||'').toLowerCase().includes(q)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 const row=s=>\`<div class="card row" data-id="\${s.id}" style="\${s.id===S.cur?'border-color:var(--acc)':''}"><div class="grow" data-act="open" style="cursor:pointer"><b style="font-weight:600">\${esc(s.title||'Untitled')}</b><br><small style="color:var(--tx2)">\${s.count??s.msgs.length} msgs · \${fmtD(s.updatedAt)}</small></div><span class="tag">$\${(s.cost||0).toFixed(4)}</span>
  <button data-act="pin" title="Pin">\${ic('pin',15)} \${s.pinned?'Unpin':'Pin'}</button><button data-act="rename">\${ic('edit',15)} Rename</button><button data-act="del">\${ic('trash',15)} Delete</button></div>\`;
 const pin=all.filter(s=>s.pinned),rest=all.filter(s=>!s.pinned);
 el.innerHTML=(pin.length?\`<details open><summary style="margin:8px 0;font-weight:600;cursor:pointer">Pinned (\${pin.length})</summary>\${pin.map(row).join('')}</details>\`:'')+\`<div style="margin:8px 0;font-weight:600">All sessions (\${rest.length})</div>\`+(rest.map(row).join('')||'<div class="sub">Nothing here yet.</div>');drawSide()}

/* --- models --- */
R.models=p=>{p.innerHTML=wrap('Model',\`Current: <b>\${esc(S.cfg.model||'none')}</b>\`,\`<input id="mq" placeholder="Search \${S.models.length} models…" style="margin-bottom:14px"><div id="ml"></div>\`);
 $('#mq').oninput=drawModels;drawModels();if(!S.models.length)loadModels().then(()=>route==='models'&&drawModels())};
function drawModels(){const q=($('#mq')||{value:''}).value.toLowerCase(),el=$('#ml');if(!el)return;if(!S.models.length){el.innerHTML='<div class="card">No models loaded. Check that the server is online (Connection page).</div>';return}
 const g={};S.models.filter(m=>!q||m.id.toLowerCase().includes(q)||(m.owned_by||'').toLowerCase().includes(q)).forEach(m=>(g[m.owned_by||'other']??=[]).push(m));
 el.innerHTML=Object.keys(g).sort().map(k=>\`<div class="sub" style="margin:16px 0 8px"><b style="color:var(--tx)">\${esc(k)}</b> · \${g[k].length}</div>\`+g[k].map(m=>{const free=/free/i.test(m.id)||m.free||(m.pricing&&+m.pricing.prompt===0);return \`<button class="opt \${m.id===S.cfg.model?'sel':''}" data-act="pickmodel" data-id="\${esc(m.id)}"><span style="width:18px">\${m.id===S.cfg.model?ic('check',16):''}</span><span class="grow"><b style="word-break:break-all">\${esc(m.id)}</b><small>ctx \${fmtCtx(m.context_window||m.context)}</small></span><span class="tag \${free?'free':'paid'}">\${free?'free':'paid'}</span></button>\`}).join('')).join('')||'<div class="card">No match.</div>'}

/* --- choice pages --- */
function choice(key,title,sub,map,extra){return p=>{p.innerHTML=wrap(title,sub,Object.entries(map).map(([k,v])=>\`<button class="opt \${S.cfg[key]===k?'sel':''}" data-act="setcfg" data-k="\${key}" data-v="\${k}"><span style="width:18px">\${S.cfg[key]===k?ic('check',16):''}</span><span><b>\${v[0]}</b><small>\${v[1]}\${extra?extra(k,v):''}</small></span></button>\`).join('')+\`<button data-act="back" class="btn-p" style="margin-top:8px">Done — back to chat</button>\`)}}
R.mode=choice('mode','Mode','How XMINAL works on your project.',MODES);
R.effort=choice('effort','Effort','Controls max output tokens per turn.',EFFORTS,(k,v)=>\` (max \${v[2]} tokens)\`);
R.permissions=p=>{choice('perm','Permission mode','When XMINAL must ask before acting.',PERMS)(p);p.querySelector('.wrap').insertAdjacentHTML('beforeend',\`<div class="card" style="margin-top:14px"><b>Always-allowed tools</b><div class="sub" style="margin:6px 0 0">\${S.always.length?S.always.map(esc).join(', ')+' <button data-act="clralways" style="margin-left:6px;padding:3px 10px">Reset</button>':'None yet.'}</div></div>\`)};

/* --- approvals --- */
R.approvals=p=>{p.innerHTML=wrap('Approvals','Risky actions appear here and as a popup while they wait.',
 \`<h3 style="margin-bottom:8px">Pending (\${S.approvals.length})</h3>\`+(S.approvals.map((q,i)=>\`<div class="card"><b>\${esc(q.name)}</b> <span class="tag">\${esc(q.risk)} risk</span><pre style="white-space:pre-wrap;margin:8px 0;font-size:12.5px;font-family:var(--mono)">\${esc(typeof q.args==='string'?q.args:JSON.stringify(q.args,null,2))}</pre><div class="row"><button class="btn-ok" data-act="apprp" data-i="\${i}" data-d="approve">Approve</button><button class="btn-no" data-act="apprp" data-i="\${i}" data-d="deny">Deny</button><button class="btn-am" data-act="apprp" data-i="\${i}" data-d="always">Always allow</button></div></div>\`).join('')||'<div class="sub">Nothing waiting.</div>')+
 \`<h3 style="margin:18px 0 8px">History</h3>\`+(S.apprLog.map(q=>\`<div class="card row"><div class="grow"><b>\${esc(q.name)}</b><br><small style="color:var(--tx2)">\${fmtD(q.done)}</small></div><span class="tag">\${esc(q.decision)}</span></div>\`).join('')||'<div class="sub">No decisions yet.</div>'))};

/* --- usage --- */
R.usage=p=>{const s=cs(),w=Date.now();const sum=ms=>S.spend.filter(x=>w-x.t<ms).reduce((a,b)=>a+b.c,0);const win=(S.models.find(m=>m.id===S.cfg.model)||{}).context_window||0;const pct=win?Math.min(100,s.lastIn/win*100):0;
 p.innerHTML=wrap('Usage','This session and overall spend.',\`<div class="grid"><div class="stat"><span>Turns</span><b>\${s.turns}</b></div><div class="stat"><span>Input tokens</span><b>\${s.inT}</b></div><div class="stat"><span>Output tokens</span><b>\${s.outT}</b></div><div class="stat"><span>Cost (session)</span><b>$\${s.cost.toFixed(4)}</b></div></div>
 <div class="card"><b>Context window</b> <span class="tag">\${pct.toFixed(1)}%</span><div class="bar" style="margin-top:10px"><i style="width:\${pct}%"></i></div><div class="sub" style="margin:8px 0 0">\${s.lastIn} / \${win?fmtCtx(win):'unknown'} tokens · model \${esc(S.cfg.model||'—')}</div></div>
 <div class="grid"><div class="stat"><span>Spent this week</span><b>$\${sum(6048e5).toFixed(4)}</b></div><div class="stat"><span>Spent this month</span><b>$\${sum(2592e6).toFixed(4)}</b></div></div>
 <h3 style="margin:18px 0 8px">Per-session breakdown</h3>\`+(Object.values(S.sessions).filter(x=>x.cost||x.turns).map(x=>\`<div class="card row"><div class="grow"><b style="font-weight:600">\${esc(x.title)}</b><br><small style="color:var(--tx2)">\${x.turns} turns · \${x.inT} in · \${x.outT} out</small></div><span class="tag">$\${x.cost.toFixed(4)}</span></div>\`).join('')||'<div class="sub">No usage yet.</div>'))};

/* --- status --- */
R.status=p=>{p.innerHTML=wrap('Connection','Local server health.',\`<div class="card row"><span class="dot \${S.online?'on':''}" style="width:12px;height:12px"></span><div class="grow"><b>\${S.online?'Local server online':'Reconnecting…'}</b><br><small style="color:var(--tx2)">\${esc(S.cfg.host)} · auto-retry every 5s</small></div><button data-act="recheck">Check now</button></div>
 <div class="grid"><div class="stat"><span>Version</span><b>\${esc(S.version||'—')}</b></div><div class="stat"><span>Providers</span><b>\${S.providers.length||'—'}</b></div><div class="stat"><span>Models</span><b>\${S.models.length||'—'}</b></div></div>
 \${S.providers.length?\`<h3 style="margin:18px 0 8px">Providers</h3>\`+S.providers.map(x=>\`<div class="card"><b>\${esc(x.name)}</b> <span class="tag">\${esc(x.type)}</span><br><small style="color:var(--tx2);word-break:break-all">\${esc(x.baseUrl)}</small></div>\`).join(''):''}\`)};

/* --- commands --- */
R.commands=p=>{p.innerHTML=wrap('Commands','Type / in chat, or press Ctrl+K anywhere. Tap a command to run it.',COMMANDS.map(c=>\`<button class="opt" data-act="cmd" data-n="\${c[0]}"><span><b>/\${c[0]}</b><small>\${c[1]}</small></span></button>\`).join('')+\`<div class="card"><b>Keyboard shortcuts</b><div class="sub" style="margin:6px 0 0;line-height:1.9">Enter — send · Shift+Enter — new line · Esc — stop / close<br>Ctrl+K — command palette · Ctrl+L — clear chat · Ctrl+N — new chat</div></div>\`)};

/* --- export --- */
const toMD=s=>\`# \${s.title}\\n\\n\`+s.msgs.map(m=>m.role==='user'?\`**You:**\\n\\n\${m.text}\\n\`:\`**XMINAL:**\\n\\n\${m.parts.filter(x=>x.type==='text').map(x=>x.text).join('')}\\n\`).join('\\n');
R.export=p=>{p.innerHTML=wrap('Share / Export',\`Session: <b>\${esc(cs().title)}</b>\`,\`<button class="opt" data-act="exmd"><span>\${ic('copy',18)}</span><span><b>Copy conversation as Markdown</b><small>Pastes anywhere.</small></span></button><button class="opt" data-act="exjson"><span>\${ic('export',18)}</span><span><b>Download as JSON</b><small>Full session with tool calls.</small></span></button><button class="opt" data-act="exid"><span>\${ic('copy',18)}</span><span><b>Copy session ID</b><small style="word-break:break-all">\${esc(cs().id)}</small></span></button>\`)};

/* --- settings --- */
R.settings=p=>{const sel=(k,o)=>\`<select data-cfg="\${k}">\${o.map(x=>\`<option value="\${x}" \${S.cfg[k]===x?'selected':''}>\${x}</option>\`).join('')}</select>\`;
 p.innerHTML=wrap('Settings','Saved in this browser.',\`<label class="f">Default model</label><select data-cfg="model">\${S.models.map(m=>\`<option \${m.id===S.cfg.model?'selected':''}>\${esc(m.id)}</option>\`).join('')||\`<option>\${esc(S.cfg.model||'—')}</option>\`}</select>
 <label class="f">Default mode</label>\${sel('mode',Object.keys(MODES))}<label class="f">Default effort</label>\${sel('effort',Object.keys(EFFORTS))}<label class="f">Permission mode</label>\${sel('perm',Object.keys(PERMS))}
 <label class="f">Server host &amp; port</label><input data-cfg="host" value="\${esc(S.cfg.host)}"><label class="f">Auth token (if started with --token)</label><input data-cfg="token" type="password" value="\${esc(S.cfg.token)}" placeholder="Bearer token">
 <div class="card" style="margin-top:24px;border-color:rgba(198,40,40,.3)"><b>Danger zone</b><div class="sub" style="margin:6px 0 10px">Deletes every chat saved in this browser.</div><button class="btn-no" data-act="clearall">Clear all sessions</button></div>\`);
 p.querySelectorAll('[data-cfg]').forEach(e=>e.onchange=()=>{S.cfg[e.dataset.cfg]=e.value.trim();save();toast('Saved');if(['host','token'].includes(e.dataset.cfg)){health();loadModels()}})};

/* --- about / more --- */
R.about=p=>{p.innerHTML=wrap('About','Local agent UI.',\`<div class="card"><div class="wm" style="font-size:24px">XMINAL</div><div class="sub" style="margin:6px 0 10px">Server v\${esc(S.version||'—')}</div><div class="row"><a href="https://github.com/" target="_blank" rel="noopener" style="text-decoration:underline">GitHub</a><a href="https://github.com/" target="_blank" rel="noopener" style="text-decoration:underline">Docs</a></div></div><div class="sub">No login · no cloud sync · no telemetry. Everything stays on your machine.</div>\`)};
R.more=p=>{p.innerHTML=wrap('All pages','Every option has its own page.',PAGES.map(([k,t])=>\`<a class="opt card" href="#/\${k}" style="display:flex;align-items:center">\${ic(k,20)}<b style="margin:0">\${t}</b></a>\`).join(''))};

/* ============ palette ============ */
function palette(){const ov=$('#ov');ov.dataset.k='pal';ov.classList.add('show');
 $('#ovc').innerHTML=\`<div style="padding:12px;border-bottom:1px solid var(--border-light)"><input id="pq" placeholder="Search commands, sessions, models, pages…" autocomplete="off"></div><div class="l" id="pl"></div>\`;
 let items=[],idx=0;const draw=()=>{const q=$('#pq').value.trim().toLowerCase();items=[];
  COMMANDS.forEach(c=>fuzzy(c[0],q)&&items.push({g:'Command',t:'/'+c[0],s:c[1],a:()=>runCmd(c[0])}));
  PAGES.forEach(c=>fuzzy(c[1],q)&&items.push({g:'Page',t:c[1],s:'',a:()=>location.hash='#/'+c[0]}));
  Object.values(S.sessions).forEach(s=>fuzzy(s.title||'',q)&&items.push({g:'Session',t:s.title,s:fmtD(s.updatedAt),a:()=>{S.cur=s.id;save();location.hash='#/chat';nav()}}));
  S.models.forEach(m=>q&&fuzzy(m.id,q)&&items.push({g:'Model',t:m.id,s:m.owned_by,a:()=>{S.cfg.model=m.id;save();toast('Model: '+m.id);nav()}}));
  items=items.slice(0,40);idx=Math.min(idx,Math.max(0,items.length-1));
  $('#pl').innerHTML=items.map((x,i)=>\`<div class="si \${i===idx?'on':''}" data-pi="\${i}"><small style="width:62px;flex:none">\${x.g}</small><b class="grow" style="word-break:break-all;font-weight:500">\${esc(x.t)}</b><small>\${esc(x.s||'')}</small></div>\`).join('')||'<div class="si">No results</div>'};
 const run=i=>{closeOv();items[i]&&items[i].a()};
 $('#pq').oninput=()=>{idx=0;draw()};
 $('#pq').onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();idx=Math.min(idx+1,items.length-1);draw()}else if(e.key==='ArrowUp'){e.preventDefault();idx=Math.max(idx-1,0);draw()}else if(e.key==='Enter')run(idx)};
 $('#pl').onclick=e=>{const r=e.target.closest('[data-pi]');if(r)run(+r.dataset.pi)};draw();$('#pq').focus()}
function closeOv(){const ov=$('#ov');if(ov.dataset.k==='appr')return;ov.classList.remove('show');ov.dataset.k=''}
$('#ov').addEventListener('mousedown',e=>{if(e.target.id==='ov')closeOv()});

/* ============ events ============ */
const pend={};
document.addEventListener('click',e=>{const t=e.target.closest('[data-act]');if(!t)return;const a=t.dataset.act,d=t.dataset,s=cs();const mi=()=>+t.closest('[data-i]')?.dataset.i;const sid=()=>t.closest('[data-id]')?.dataset.id;
 const refresh=()=>{route==='sessions'?drawSessions():drawSide();paintTop()};
 const A={
  menuopen:()=>$('#drawer').classList.add('show'),menuclose:()=>$('#drawer').classList.remove('show'),
  send:()=>send(),stop:()=>S.abort&&S.abort.abort(),
  new:()=>{newSession();$('#drawer').classList.remove('show');location.hash='#/chat';nav()},
  chip:()=>send(d.t),attach:()=>$('#fi').click(),palette,
  rmfile:()=>{attach.splice(+d.i,1);paintFiles()},
  slashpick:()=>{$('#ta').value='';$('#slash').style.display='none';runCmd(d.n)},
  copycode:()=>copy(t.closest('.code').querySelector('pre').textContent),
  copymsg:()=>{const m=s.msgs[mi()];copy(m.role==='user'?m.text:m.parts.filter(x=>x.type==='text').map(x=>x.text).join(''))},
  editmsg:()=>{const i=mi();$('#ta').value=s.msgs[i].text;s.msgs.splice(i);save();renderMsgs(true);$('#ta').focus()},
  delmsg:()=>{s.msgs.splice(mi(),1);save();renderMsgs(true)},
  regen:()=>{const i=mi();s.msgs.splice(i);const u=[...s.msgs].reverse().find(m=>m.role==='user');if(u){s.msgs.pop();s.msgs.push(u);send(s.lastText||u.text,true)}},
  retry:()=>{const i=mi();s.msgs.splice(i);send(s.lastText,true)},
  up:()=>toast('Thanks for the feedback'),down:()=>toast('Thanks for the feedback'),
  mic:()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return toast('Voice not supported in this browser');const r=new SR();r.lang=navigator.language;r.onresult=ev=>{$('#ta').value+=ev.results[0][0].transcript;$('#ta').dispatchEvent(new Event('input'))};r.onend=()=>$('#micb').style.color='';$('#micb').style.color='var(--er)';r.start()},
  appr:()=>{const q=S.approvals[0];if(q)decide(q,d.d==='deny'?'deny':'approve',d.d==='always')},
  apprp:()=>{const q=S.approvals[+d.i];if(q)decide(q,d.d==='deny'?'deny':'approve',d.d==='always')},
  clralways:()=>{S.always=[];save();nav()},
  open:()=>{S.cur=sid();save();location.hash==='#/chat'?nav():location.hash='#/chat'},
  pin:()=>{const x=S.sessions[sid()];x.pinned=!x.pinned;save();refresh()},
  rename:()=>{const x=S.sessions[sid()];const n=prompt('Rename session',x.title);if(n){x.title=n;save();refresh()}},
  del:()=>{const id=sid();if(pend[id]){delete pend[id];delete S.sessions[id];if(S.cur===id){const r=Object.keys(S.sessions)[0];r?S.cur=r:newSession()}save();route==='chat'?nav():refresh()}else{pend[id]=1;const o=t.innerHTML;t.classList.add('arm');t.innerHTML='Sure?';setTimeout(()=>{delete pend[id];if(t.isConnected){t.classList.remove('arm');t.innerHTML=o}},3000)}},
  pickmodel:()=>{S.cfg.model=d.id;save();location.hash='#/chat'},
  setcfg:()=>{S.cfg[d.k]=d.v;save();nav()},
  back:()=>location.hash='#/chat',
  recheck:()=>health().then(()=>nav()),
  cmd:()=>runCmd(d.n),
  exmd:()=>copy(toMD(s)),
  exjson:()=>{const b=new Blob([JSON.stringify(s,null,2)],{type:'application/json'});const u=document.createElement('a');u.href=URL.createObjectURL(b);u.download=(s.title||'session').replace(/\\W+/g,'_')+'.json';u.click()},
  exid:()=>copy(s.id),
  clearall:()=>{if(pend.all){delete pend.all;S.sessions={};newSession();toast('All sessions cleared');nav()}else{pend.all=1;t.textContent='Sure? Tap again to delete everything';setTimeout(()=>{delete pend.all;t.isConnected&&(t.textContent='Clear all sessions')},3500)}}
 };A[a]&&A[a]()});
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();
 if((e.ctrlKey||e.metaKey)&&k==='k'){e.preventDefault();palette()}
 else if((e.ctrlKey||e.metaKey)&&k==='l'){e.preventDefault();clearChat()}
 else if((e.ctrlKey||e.metaKey)&&k==='n'){e.preventDefault();newSession();location.hash='#/chat';nav()}
 else if(e.key==='Escape'){if(S.gen&&S.abort)S.abort.abort();closeOv();$('#drawer').classList.remove('show')}});

/* ============ boot ============ */
nav();health();loadModels().then(()=>{if(route==='models'||route==='chat')nav()});loadSessions().then(drawSide);
setInterval(health,5000);
</script>
</body>
</html>
`;
