// Server-rendered HTML pages. No framework, no client runtime beyond a few
// progressive-enhancement copy buttons.

import {
	catalogSummary,
	getRecord,
	IDENTIFIERS,
	PRODUCTS,
	RECIPES,
	SECTORS,
	SOURCE_BY_ID,
	SOURCES,
	searchCatalog,
	type Product,
	type Recipe,
	type Source,
} from './mcp/catalog';
import { PROMPTS, RESOURCE_TEMPLATES, SERVER_INFO, STATIC_RESOURCES } from './mcp/protocol';
import { TOOLS } from './mcp/tools';

export const PUBLIC_ORIGIN = 'https://mcp-afp.manalejandro.com';

function esc(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const SYMBOL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40" role="img" aria-label="Administración fuentes públicas"><path transform="matrix(0.8502 0 0 0.8502 -2.463 53.394)" d="M30.8 7.77Q27.02 7.77 24.05 6.16Q21.07 4.55 19.5 1.65Q17.92 -1.26 18.2 -5.18L18.9 -15.33Q19.04 -17.57 17.64 -18.9Q16.24 -20.23 14 -20.23H5.25V-30.03H14Q16.24 -30.03 17.64 -31.4Q19.04 -32.76 18.9 -34.93L18.2 -45.5Q17.99 -49.35 19.53 -52.19Q21.07 -55.02 24.01 -56.56Q26.95 -58.1 30.8 -58.1H36.75V-48.3H32.9Q30.94 -48.3 29.75 -47.32Q28.56 -46.34 28.7 -44.1L29.4 -33.53Q29.68 -29.68 26.71 -27.34Q23.73 -24.99 18.55 -24.99V-25.48Q23.73 -25.48 26.71 -23.07Q29.68 -20.65 29.4 -16.73L28.7 -6.23Q28.63 -4.34 29.82 -3.19Q31.01 -2.03 32.9 -2.03H36.75V7.77Z" fill="#D52B1E"/><rect x="24" y="18" width="16" height="28" rx="2" fill="#FFC400"/><path transform="matrix(0.8502 0 0 0.8502 30.757 53.394)" d="M5.25 7.77V-2.03H9.1Q10.99 -2.03 12.21 -3.19Q13.44 -4.34 13.3 -6.23L12.6 -16.73Q12.32 -20.65 15.33 -23.07Q18.34 -25.48 23.45 -25.48V-24.99Q18.34 -24.99 15.33 -27.34Q12.32 -29.68 12.6 -33.53L13.3 -44.1Q13.44 -46.34 12.29 -47.32Q11.13 -48.3 9.1 -48.3H5.25V-58.1H11.2Q15.05 -58.1 17.99 -56.56Q20.93 -55.02 22.51 -52.19Q24.08 -49.35 23.8 -45.5L23.1 -34.93Q22.96 -32.76 24.4 -31.4Q25.83 -30.03 28 -30.03H36.75V-20.23H28Q25.83 -20.23 24.4 -18.9Q22.96 -17.57 23.1 -15.33L23.8 -5.18Q24.08 -1.26 22.51 1.65Q20.93 4.55 17.99 6.16Q15.05 7.77 11.2 7.77Z" fill="#D52B1E"/></svg>`;

const CSS = `
:root {
  --bg: #111318;
  --bg-soft: #151821;
  --panel: #181c25;
  --panel-2: #1d222d;
  --line: #2b313e;
  --line-soft: #232936;
  --text: #e9ecf3;
  --muted: #9aa4b5;
  --faint: #6f798b;
  --red: #d52b1e;
  --red-soft: rgba(213, 43, 30, 0.14);
  --yellow: #ffc400;
  --yellow-soft: rgba(255, 196, 0, 0.12);
  --green: #46c08a;
  --blue: #6aa8ff;
  --radius: 14px;
  --radius-sm: 9px;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  --max: 1120px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background:
    radial-gradient(900px 500px at 85% -10%, rgba(213, 43, 30, 0.18), transparent 62%),
    radial-gradient(700px 420px at 8% 0%, rgba(255, 196, 0, 0.08), transparent 60%),
    var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.62;
  -webkit-font-smoothing: antialiased;
}
::selection { background: var(--yellow); color: #111318; }
a { color: var(--yellow); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 3px; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible {
  outline: 2px solid var(--yellow);
  outline-offset: 3px;
  border-radius: 4px;
}
.skip { position: absolute; left: -9999px; top: 0; background: var(--yellow); color: #111; padding: 10px 16px; z-index: 100; }
.skip:focus { left: 12px; top: 12px; }
.wrap { width: min(var(--max), calc(100% - 40px)); margin: 0 auto; }
header.site {
  position: sticky; top: 0; z-index: 40;
  border-bottom: 1px solid var(--line-soft);
  background: rgba(17, 19, 24, 0.82);
  backdrop-filter: blur(14px);
}
.nav { display: flex; align-items: center; gap: 18px; min-height: 68px; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-weight: 700; letter-spacing: -0.02em; }
.brand:hover { text-decoration: none; }
.brand svg { width: 32px; height: 32px; flex: none; }
.brand span { font-size: 1.02rem; }
.brand small { display: block; color: var(--muted); font-size: 0.72rem; font-weight: 500; letter-spacing: 0.02em; }
.nav-links { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }
.nav-links a { color: var(--muted); padding: 8px 11px; border-radius: 8px; font-size: 0.9rem; font-weight: 500; }
.nav-links a:hover { color: var(--text); background: var(--panel-2); text-decoration: none; }
.nav-links a[aria-current="page"] { color: var(--text); background: var(--panel-2); }
.pill {
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid var(--line); border-radius: 999px;
  padding: 5px 11px; font-size: 0.78rem; color: var(--muted); background: var(--bg-soft);
  white-space: nowrap;
}
.pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 4px rgba(70, 192, 138, 0.14); }
main { padding: 56px 0 80px; }
.hero { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr); gap: 34px; align-items: start; padding: 26px 0 44px; }
.eyebrow { color: var(--yellow); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; margin: 0 0 14px; }
h1 { font-size: clamp(2.3rem, 5vw, 4rem); line-height: 1.03; letter-spacing: -0.045em; margin: 0 0 18px; text-wrap: balance; }
h1 .accent { color: var(--yellow); }
.lead { color: var(--muted); font-size: 1.12rem; max-width: 64ch; margin: 0 0 26px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--line); background: var(--panel); color: var(--text);
  padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 0.92rem; cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.btn:hover { transform: translateY(-1px); border-color: var(--faint); background: var(--panel-2); text-decoration: none; }
.btn.primary { background: var(--yellow); color: #141414; border-color: var(--yellow); }
.btn.primary:hover { background: #ffd43b; }
.btn.ghost { background: transparent; }
.terminal {
  border: 1px solid var(--line); border-radius: var(--radius); background: #0c0e12;
  box-shadow: var(--shadow); overflow: hidden;
}
.terminal-top { display: flex; align-items: center; gap: 7px; padding: 11px 14px; border-bottom: 1px solid var(--line); background: #0f1217; }
.terminal-top i { width: 10px; height: 10px; border-radius: 50%; background: #333a47; display: block; }
.terminal-top i:nth-child(1) { background: #d93b30; }
.terminal-top i:nth-child(2) { background: #d9a22a; }
.terminal-top i:nth-child(3) { background: #3fae74; }
.terminal-top span { margin-left: 8px; color: var(--faint); font-family: var(--mono); font-size: 0.76rem; }
.terminal pre { margin: 0; padding: 18px; overflow: auto; }
.terminal code { font-family: var(--mono); font-size: 0.82rem; line-height: 1.7; color: #d8deea; }
.stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 0 0 56px; }
.stat { border: 1px solid var(--line); background: linear-gradient(180deg, var(--panel), var(--bg-soft)); border-radius: var(--radius-sm); padding: 16px 14px; }
.stat b { display: block; font-size: 1.7rem; letter-spacing: -0.03em; line-height: 1.1; }
.stat span { color: var(--muted); font-size: 0.8rem; }
section { margin: 0 0 62px; scroll-margin-top: 88px; }
.section-head { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin: 0 0 20px; flex-wrap: wrap; }
h2 { font-size: clamp(1.5rem, 2.6vw, 2.05rem); letter-spacing: -0.03em; margin: 0; line-height: 1.15; }
.section-head p { color: var(--muted); margin: 6px 0 0; max-width: 68ch; }
.grid { display: grid; gap: 14px; }
.grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.card {
  border: 1px solid var(--line); background: linear-gradient(180deg, var(--panel), var(--bg-soft));
  border-radius: var(--radius); padding: 20px; min-width: 0;
}
.card h3 { margin: 0 0 8px; font-size: 1.03rem; letter-spacing: -0.01em; }
.card p { color: var(--muted); margin: 0; font-size: 0.93rem; }
.card .meta { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
.card.feature { position: relative; overflow: hidden; }
.card.feature::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--red); opacity: 0.9; }
.tag { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-family: var(--mono); font-size: 0.7rem; color: var(--muted); background: var(--bg); }
.tag.yellow { color: var(--yellow); border-color: rgba(255, 196, 0, 0.35); background: var(--yellow-soft); }
.tag.red { color: #ff8d84; border-color: rgba(213, 43, 30, 0.45); background: var(--red-soft); }
.tag.green { color: var(--green); border-color: rgba(70, 192, 138, 0.35); background: rgba(70, 192, 138, 0.1); }
.tag.blue { color: var(--blue); border-color: rgba(106, 168, 255, 0.35); background: rgba(106, 168, 255, 0.1); }
.tool { border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg-soft); padding: 18px; }
.tool header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.tool h3 { font-family: var(--mono); color: var(--yellow); font-size: 0.92rem; margin: 0 0 8px; letter-spacing: -0.01em; }
.tool p { margin: 0 0 12px; color: var(--muted); font-size: 0.91rem; }
.args { display: flex; flex-wrap: wrap; gap: 6px; }
.args code { font-family: var(--mono); font-size: 0.72rem; color: var(--muted); border: 1px solid var(--line); border-radius: 6px; padding: 2px 6px; background: var(--bg); }
pre.code {
  margin: 0; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
  background: #0c0e12; overflow: auto; font-family: var(--mono); font-size: 0.8rem; line-height: 1.7;
}
.copy-row { display: flex; justify-content: flex-end; margin: -8px 0 8px; }
.copy {
  border: 1px solid var(--line); background: var(--panel-2); color: var(--muted);
  border-radius: 7px; padding: 4px 9px; font-size: 0.72rem; font-family: var(--mono); cursor: pointer;
}
.copy:hover { color: var(--text); border-color: var(--faint); }
details.client { border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--bg-soft); margin: 0 0 8px; }
details.client summary { cursor: pointer; padding: 12px 16px; font-weight: 600; font-size: 0.92rem; list-style: none; display: flex; align-items: center; gap: 8px; }
details.client summary::-webkit-details-marker { display: none; }
details.client summary::before { content: "+"; color: var(--yellow); font-family: var(--mono); font-weight: 700; }
details.client[open] summary::before { content: "−"; }
details.client > div { padding: 0 12px 12px; }
.notice { border-left: 3px solid var(--yellow); background: var(--yellow-soft); padding: 14px 16px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: #e7d9a8; }
.danger { border-left: 3px solid var(--red); background: var(--red-soft); padding: 14px 16px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.danger strong { color: #ff9b93; }
ul.clean { margin: 0; padding-left: 20px; }
ul.clean li { margin: 0 0 6px; color: var(--muted); }
ul.clean li strong { color: var(--text); }
dl.facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 16px; margin: 0; }
dl.facts dt { color: var(--faint); font-size: 0.82rem; }
dl.facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); }
table { border-collapse: collapse; width: 100%; font-size: 0.88rem; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
th { color: var(--faint); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; background: var(--bg-soft); }
tr:last-child td { border-bottom: 0; }
td code, p code, li code, dd code, h3 code { font-family: var(--mono); font-size: 0.82em; background: rgba(255, 255, 255, 0.045); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
.crumbs { color: var(--faint); font-size: 0.82rem; margin: 0 0 18px; }
.crumbs a { color: var(--muted); }
.page-head { margin: 0 0 34px; }
.page-head h1 { font-size: clamp(1.9rem, 4vw, 3rem); margin-bottom: 12px; }
.page-head p { color: var(--muted); max-width: 76ch; margin: 0; }
.filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; border: 1px solid var(--line); background: var(--bg-soft); padding: 14px; border-radius: var(--radius-sm); margin: 0 0 20px; }
.filters label { display: grid; gap: 5px; font-size: 0.76rem; color: var(--faint); text-transform: uppercase; letter-spacing: 0.08em; }
.filters input, .filters select {
  background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px;
  padding: 8px 10px; font-family: var(--sans); font-size: 0.9rem; min-width: 0;
}
.filters input { min-width: 260px; }
.filters .grow { flex: 1 1 260px; }
.filters .btn { padding: 8px 14px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
footer.site { border-top: 1px solid var(--line-soft); padding: 30px 0 46px; color: var(--faint); font-size: 0.84rem; }
footer.site .wrap { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
footer.site a { color: var(--muted); }
.empty { border: 1px dashed var(--line); border-radius: var(--radius); padding: 30px; text-align: center; color: var(--muted); }
.mono { font-family: var(--mono); }
.small { font-size: 0.82rem; }
.muted { color: var(--muted); }
.nowrap { white-space: nowrap; }
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .grid.three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .wrap { width: min(var(--max), calc(100% - 28px)); }
  .nav { flex-wrap: wrap; gap: 4px 10px; min-height: 0; padding: 12px 0 10px; }
  .nav-links { order: 2; width: 100%; margin-left: 0; flex-wrap: nowrap; gap: 2px; overflow-x: auto; scrollbar-width: none; }
  .nav-links::-webkit-scrollbar { display: none; }
  .nav-links a { padding: 6px 9px; font-size: 0.84rem; white-space: nowrap; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid.two, .grid.three { grid-template-columns: 1fr; }
  main { padding-top: 32px; }
  .filters input { min-width: 100%; }
  dl.facts { grid-template-columns: 1fr; gap: 2px 0; }
  dl.facts dd { margin-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; transition: none !important; }
}
@media print {
  body { background: #fff; color: #111; }
  header.site, footer.site, .actions, .copy-row { display: none; }
  .card, .tool, pre.code { border-color: #ddd; background: #fff; }
  a { color: #111; }
}
`;

const JS = `
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const target = document.getElementById(button.getAttribute('data-copy'));
  if (!target) return;
  try {
    await navigator.clipboard.writeText(target.textContent || '');
    const previous = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = previous; }, 1600);
  } catch {
    button.textContent = 'Press Ctrl+C';
  }
});
`;

interface LayoutOptions {
	title: string;
	description: string;
	path: string;
	body: string;
	current?: 'home' | 'sources' | 'products' | 'recipes' | 'identifiers' | 'search';
}

function layout(options: LayoutOptions): string {
	const title = options.title === SERVER_INFO.title ? options.title : `${options.title} · ${SERVER_INFO.title}`;
	const canonical = `${PUBLIC_ORIGIN}${options.path}`;
	const navItem = (href: string, label: string, key: NonNullable<LayoutOptions['current']>) =>
		`<a href="${href}"${options.current === key ? ' aria-current="page"' : ''}>${label}</a>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(options.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#111318">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(options.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="wrap nav">
    <a class="brand" href="/" aria-label="Administración fuentes públicas, home">
      ${SYMBOL}
      <span>Administración fuentes públicas<small>Remote MCP server · Spain</small></span>
    </a>
    <nav class="nav-links" aria-label="Main">
      ${navItem('/sources', 'Sources', 'sources')}
      ${navItem('/products', 'Products', 'products')}
      ${navItem('/recipes', 'Recipes', 'recipes')}
      ${navItem('/identifiers', 'Identifiers', 'identifiers')}
      <a href="/search">Search</a>
      <a href="/llms.txt">llms.txt</a>
      <a href="https://github.com/manalejandro/mcp-administracion-fuentes-publicas">GitHub</a>
    </nav>
  </div>
</header>
<main id="main">
${options.body}
</main>
<footer class="site">
  <div class="wrap">
    <span>Built on <a href="https://github.com/BquantFinance/Administracion-fuentes-publicas">Administración fuentes públicas</a> · catalog generated ${esc(catalogSummary().generated)}</span>
    <span>MIT · <a href="https://github.com/manalejandro/mcp-administracion-fuentes-publicas">Source</a> · <a href="/health">Health</a> · <a href="/llms-min.txt">llms-min</a></span>
  </div>
</footer>
<script>${JS}</script>
</body>
</html>`;
}

function badge(text: string, kind = ''): string {
	return `<span class="tag ${kind}">${esc(text)}</span>`;
}

function codeBlock(id: string, code: string, language = ''): string {
	return `<div class="copy-row"><button class="copy" type="button" data-copy="${esc(id)}">Copy</button></div>
<pre class="code" id="${esc(id)}"><code${language ? ` class="language-${esc(language)}"` : ''}>${esc(code)}</code></pre>`;
}

function list(items: string[] | undefined, empty = ''): string {
	if (!items?.length) return empty;
	return `<ul class="clean">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

export function indexPage(): string {
	const summary = catalogSummary();
	const endpoint = `${PUBLIC_ORIGIN}/mcp`;
	const sseEndpoint = `${PUBLIC_ORIGIN}/sse`;
	const discovery = `curl -s ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -H 'MCP-Protocol-Version: 2026-07-28' \\
  -H 'Mcp-Method: server/discover' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'`;

	const cursor = JSON.stringify(
		{ mcpServers: { 'administracion-fuentes-publicas': { url: endpoint } } },
		null,
		2,
	);
	const cursorSse = JSON.stringify(
		{ mcpServers: { 'administracion-fuentes-publicas': { url: sseEndpoint } } },
		null,
		2,
	);

	const toolCards = TOOLS.map(
		(tool) => `<article class="tool">
      <header><h3>${esc(tool.name)}</h3></header>
      <p>${esc(tool.description.split('. ').slice(0, 2).join('. '))}</p>
      <div class="args">${Object.keys(tool.inputSchema.properties)
				.map((name) => `<code>${esc(name)}${(tool.inputSchema.required ?? []).includes(name) ? '*' : ''}</code>`)
				.join('')}</div>
    </article>`,
	).join('');

	const resourceCards = STATIC_RESOURCES.map(
		(resource) => `<article class="card">
      <h3 class="mono" style="color:var(--yellow);font-size:.86rem">${esc(resource.uri)}</h3>
      <p>${esc(resource.description)}</p>
      <div class="meta">${badge(resource.mimeType)}</div>
    </article>`,
	).join('');

	const templateCards = RESOURCE_TEMPLATES.map(
		(template) => `<article class="card">
      <h3 class="mono" style="color:var(--yellow);font-size:.86rem">${esc(template.uriTemplate)}</h3>
      <p>${esc(template.description)}</p>
    </article>`,
	).join('');

	const promptCards = PROMPTS.map(
		(prompt) => `<article class="card">
      <h3 class="mono" style="color:var(--yellow);font-size:.86rem">${esc(prompt.name)}</h3>
      <p>${esc(prompt.description)}</p>
      <div class="meta">${prompt.arguments.map((arg) => badge(`${arg.name}${arg.required ? '*' : ''}`)).join('')}</div>
    </article>`,
	).join('');

	const body = `
<div class="wrap">
  <div class="hero">
    <div>
      <p class="eyebrow">Remote MCP server · Streamable HTTP + SSE</p>
      <h1>Spanish public data, <span class="accent">ready for agents.</span></h1>
      <p class="lead">Where each dataset lives, how to request it, what it returns and the verified traps that change a number without raising an error. A catalog of ${summary.counts.sources} sources, ${summary.counts.recipes} recipes and ${summary.counts.identifiers} identifiers, exposed as tools, resources and prompts.</p>
      <div class="actions">
        <a class="btn primary" href="#connect">Connect</a>
        <a class="btn" href="/sources">Browse sources</a>
        <a class="btn ghost" href="/llms-min.txt">Read llms-min</a>
      </div>
    </div>
    <div class="terminal" aria-label="Server endpoints">
      <div class="terminal-top"><i></i><i></i><i></i><span>${esc(endpoint.replace('https://', ''))}</span></div>
      <pre><code><span style="color:#6f798b">POST</span> /mcp       modern 2026-07-28
<span style="color:#6f798b">GET </span> /sse       legacy SSE
<span style="color:#6f798b">GET </span> /health    status
<span style="color:#6f798b">GET </span> /llms.txt  agent guide

<span style="color:#46c08a">●</span> catalog-only · no third-party fetch
<span style="color:#46c08a">●</span> read-only · MIT</code></pre>
    </div>
  </div>

  <div class="stats" aria-label="Catalog statistics">
    <div class="stat"><b>${summary.counts.sources}</b><span>sources</span></div>
    <div class="stat"><b>${summary.counts.products}</b><span>products</span></div>
    <div class="stat"><b>${summary.counts.recipes}</b><span>recipes</span></div>
    <div class="stat"><b>${summary.counts.needs}</b><span>information needs</span></div>
    <div class="stat"><b>${summary.counts.identifiers}</b><span>identifiers</span></div>
  </div>

  <section aria-labelledby="what">
    <div class="section-head">
      <div><h2 id="what">What is inside</h2><p>Not a list of links. Each record carries the access method, the formats, the update cadence, the identifier joins and the traps verified with real calls.</p></div>
    </div>
    <div class="grid three">
      <article class="card feature"><h3>Sources</h3><p>${summary.counts.sources} datasets from central, regional and local government. Endpoints, auth, formats, coverage, licence, quirks and gotchas.</p><div class="meta">${badge(`${summary.statuses.active ?? 0} active`, 'green')}${badge(`${summary.statuses.degraded ?? 0} degraded`, 'red')}${badge(`${summary.levels.age ?? 0} central`)}</div></article>
      <article class="card"><h3>Recipes</h3><p>${summary.counts.recipes} ordered procedures that combine sources for a concrete intent, with the exact request and a verification check.</p><div class="meta">${badge('steps')}${badge('checks')}${badge('verified dates')}</div></article>
      <article class="card"><h3>Identifiers</h3><p>${summary.counts.identifiers} join keys with format, regex, issuer and the known pitfalls: INE, NUTS, cadastre, NIF, DIR3, CPV, CNAE, BOE, ELI and more.</p><div class="meta">${badge('joins')}${badge('regex')}${badge('examples')}</div></article>
    </div>
  </section>

  <section id="connect" aria-labelledby="connect-title">
    <div class="section-head">
      <div><h2 id="connect-title">Connect</h2><p>Use the modern Streamable HTTP endpoint at <code>/mcp</code>. Clients that only speak the legacy HTTP+SSE transport can use <code>/sse</code>.</p></div>
    </div>
    <div class="grid two">
      <article class="card">
        <h3>Claude Code</h3>
        <p class="small muted">Add the server with the CLI, then ask for Spanish public data in plain language.</p>
        ${codeBlock('claude-code', `claude mcp add --transport http administracion-fuentes-publicas ${endpoint}`)}
      </article>
      <article class="card">
        <h3>Cursor / generic JSON</h3>
        <p class="small muted">Any client that accepts a URL for Streamable HTTP can use this block.</p>
        ${codeBlock('cursor-json', cursor, 'json')}
      </article>
    </div>
    <div style="height:14px"></div>
    <div class="grid two">
      <article class="card">
        <h3>Legacy SSE</h3>
        <p class="small muted">For clients that predate Streamable HTTP. The server keeps one Durable Object per session.</p>
        ${codeBlock('cursor-sse', cursorSse, 'json')}
      </article>
      <article class="card">
        <h3>Raw discovery</h3>
        <p class="small muted">No SDK required: one POST with the modern metadata headers returns versions, capabilities and instructions.</p>
        ${codeBlock('discovery', discovery, 'bash')}
      </article>
    </div>
  </section>

  <section id="tools" aria-labelledby="tools-title">
    <div class="section-head">
      <div><h2 id="tools-title">Tools</h2><p>Eight read-only tools. Required arguments are marked with <code>*</code>; every result is compact JSON sized for agent context.</p></div>
      <a class="btn ghost" href="/llms-min.txt">Agent quick start</a>
    </div>
    <div class="grid three">${toolCards}</div>
  </section>

  <section id="resources" aria-labelledby="resources-title">
    <div class="section-head">
      <div><h2 id="resources-title">Resources</h2><p>Read-only documents and per-record resources. Templates are filled with any id returned by the tools.</p></div>
    </div>
    <div class="grid three">${resourceCards}${templateCards}</div>
  </section>

  <section id="prompts" aria-labelledby="prompts-title">
    <div class="section-head">
      <div><h2 id="prompts-title">Prompts</h2><p>Reusable instructions that make an agent search the catalog, read the traps and answer with evidence instead of guessing.</p></div>
    </div>
    <div class="grid three">${promptCards}</div>
  </section>

  <section aria-labelledby="protocol">
    <div class="section-head"><div><h2 id="protocol">Protocol</h2><p>Both eras are served from the same Worker. The modern endpoint validates protocol metadata; the legacy endpoint keeps the initialize handshake and the SSE stream.</p></div></div>
    <div class="grid two">
      <article class="card">
        <h3>Modern · 2026-07-28</h3>
        <p><code>POST /mcp</code> with <code>MCP-Protocol-Version</code>, <code>Mcp-Method</code> and, for named operations, <code>Mcp-Name</code>. Start with <code>server/discover</code>; there is no session and no GET stream.</p>
        <div class="meta">${badge('server/discover')}${badge('_meta per request')}${badge('resultType')}</div>
      </article>
      <article class="card">
        <h3>Legacy · 2024-11-05</h3>
        <p><code>GET /sse</code> opens a stream and returns the message endpoint. <code>POST /messages?sessionId=…</code> sends JSON-RPC and receives responses over the stream.</p>
        <div class="meta">${badge('initialize')}${badge('HTTP+SSE')}${badge('Durable Object')}</div>
      </article>
    </div>
  </section>

  <section aria-labelledby="scope">
    <div class="section-head"><div><h2 id="scope">Scope and safety</h2></div></div>
    <div class="notice"><strong>Catalog-only by design.</strong> The server never fetches third-party URLs and never writes to a source. It returns endpoints, examples and exact first requests; your agent or application makes the call. The catalog content is in Spanish; tool names and documentation are in English.</div>
  </section>
</div>`;

	return layout({
		title: SERVER_INFO.title,
		description:
			'Remote MCP server for the Spanish public data catalog: sources, recipes, products, identifiers and verified traps for agents.',
		path: '/',
		body,
		current: 'home',
	});
}

export function searchPage(query: string, sector = '', result?: ReturnType<typeof searchCatalog>): string {
	// An unknown `sector` in the query string would quietly drop every source
	// from the results; ignore it instead.
	const activeSector = sector && sector in SECTORS ? sector : '';
	const data = result ?? searchCatalog({ query, sector: activeSector || undefined });
	const groups: string[] = [];
	const count =
		(data.sources?.length ?? 0) +
		(data.recipes?.length ?? 0) +
		(data.products?.length ?? 0) +
		(data.needs?.length ?? 0) +
		(data.identifiers?.length ?? 0);
	const countResults = count === 1 ? '1 result' : `${count} results`;

	if (data.sources?.length) {
		groups.push(`<h2 style="margin:34px 0 14px">Sources</h2><div class="grid two">${data.sources
			.map(
				(source) => `<article class="card feature">
          <h3><a href="/sources/${esc(source.id)}">${esc(source.name)}</a></h3>
          <p>${esc(source.summary)}</p>
          <div class="meta">${badge(source.sector_label ?? source.sector)}${badge(source.level)}${badge(source.status, source.status === 'active' ? 'green' : 'red')}${(source.formats ?? []).slice(0, 4).map((format) => badge(format)).join('')}</div>
        </article>`,
			)
			.join('')}</div>`);
	}
	if (data.recipes?.length) {
		groups.push(`<h2 style="margin:34px 0 14px">Recipes</h2><div class="grid two">${data.recipes
			.map(
				(recipe) => `<article class="card"><h3><a href="/recipes/${esc(recipe.id)}">${esc(recipe.intent)}</a></h3><div class="meta">${badge(recipe.id)}${recipe.sources.map((source) => badge(source)).join('')}</div></article>`,
			)
			.join('')}</div>`);
	}
	if (data.products?.length) {
		groups.push(`<h2 style="margin:34px 0 14px">Products</h2><div class="grid two">${data.products
			.map(
				(product) => `<article class="card"><h3><a href="/products">${esc(product.producto)}</a></h3><div class="meta">${badge(product.id)}${product.fuentes.map((source) => badge(source)).join('')}</div></article>`,
			)
			.join('')}</div>`);
	}
	if (data.needs?.length) {
		groups.push(`<h2 style="margin:34px 0 14px">Information needs</h2><div class="grid two">${data.needs
			.map(
				(need) => `<article class="card"><p style="color:var(--text)">${esc(need.need)}</p>${need.source ? `<div class="meta"><a class="tag yellow" href="/sources/${esc(need.source)}">${esc(need.source)}</a></div>` : need.note ? `<p class="small" style="margin-top:10px">${esc(need.note)}</p>` : ''}</article>`,
			)
			.join('')}</div>`);
	}
	if (data.identifiers?.length) {
		groups.push(`<h2 style="margin:34px 0 14px">Identifiers</h2><div class="grid two">${data.identifiers
			.map(
				(identifier) => `<article class="card"><h3 class="mono"><a href="/identifiers#${esc(identifier.id)}">${esc(identifier.id)}</a></h3><p>${esc(identifier.format)}</p><div class="meta">${identifier.example ? badge(`e.g. ${identifier.example}`) : ''}</div></article>`,
			)
			.join('')}</div>`);
	}

	const results = groups.length
		? groups.join('')
		: `<div class="empty"><p>No results${query ? ` for <strong>${esc(query)}</strong>` : ''}.</p><p class="small">Try a broader term in Spanish or English, or <a href="/sources">browse all sources</a>.</p></div>`;

	const body = `
<div class="wrap">
  <div class="page-head">
    <p class="crumbs"><a href="/">Home</a> / Search</p>
    <h1>Search the catalog</h1>
    <p>One query searches sources, recipes, products, information needs and identifiers.</p>
  </div>
  <form class="filters" method="get" action="/search" role="search">
    <label class="grow">Query<input type="search" name="q" value="${esc(query)}" placeholder="unemployment by municipality, fuel prices, contratación menor" autofocus></label>
    <label>Sector<select name="sector">
      <option value="">All sectors</option>
      ${Object.entries(SECTORS).map(([id, label]) => `<option value="${esc(id)}"${activeSector === id ? ' selected' : ''}>${esc(label)}</option>`).join('')}
    </select></label>
    <button class="btn primary" type="submit">Search</button>
  </form>
  ${query ? `<p class="muted small">${countResults} for <strong style="color:var(--text)">${esc(query)}</strong>${activeSector ? ` in <strong style="color:var(--text)">${esc(SECTORS[activeSector])}</strong>` : ''}.</p>` : ''}
  ${results}
</div>`;

	return layout({
		title: query ? `Search: ${query}` : 'Search',
		description: 'Search Spanish public data sources, recipes, products, information needs and identifiers.',
		path: '/search',
		body,
		current: 'search',
	});
}

export function sourcesPage(options: { sector?: string; level?: string; status?: string; format?: string; query?: string }): string {
	// Ignore filter values that are not part of the catalog instead of
	// returning an empty list with no visible reason.
	const sector = options.sector && options.sector in SECTORS ? options.sector : '';
	const level = ['age', 'ccaa', 'local'].includes(options.level ?? '') ? (options.level as string) : '';
	const status = ['active', 'degraded', 'unknown'].includes(options.status ?? '') ? (options.status as string) : '';
	const query = (options.query ?? '').trim();

	const filtered = SOURCES.filter((source) => {
		if (sector && source.sector !== sector) return false;
		if (level && source.level !== level) return false;
		if (status && source.status !== status) return false;
		if (options.format && !source.formats.includes(options.format)) return false;
		if (query) {
			const haystack = `${source.id} ${source.name} ${source.org} ${source.summary}`.toLowerCase();
			if (!haystack.includes(query.toLowerCase())) return false;
		}
		return true;
	});

	const cards = filtered
		.map(
			(source) => `<article class="card">
      <h3><a href="/sources/${esc(source.id)}">${esc(source.name)}</a></h3>
      <p>${esc(source.summary)}</p>
      <div class="meta">${badge(SECTORS[source.sector] ?? source.sector, 'yellow')}${badge(source.level)}${badge(source.status, source.status === 'active' ? 'green' : 'red')}${source.formats.slice(0, 4).map((format) => badge(format)).join('')}</div>
    </article>`,
		)
		.join('');

	const body = `
<div class="wrap">
  <div class="page-head">
    <p class="crumbs"><a href="/">Home</a> / Sources</p>
    <h1>Sources</h1>
    <p>${filtered.length} of ${SOURCES.length} datasets. Filter by sector, administrative level, status or format.</p>
  </div>
  <form class="filters" method="get" action="/sources">
    <label class="grow">Text<input type="search" name="q" value="${esc(query)}" placeholder="name, organisation or summary"></label>
    <label>Sector<select name="sector"><option value="">All</option>${Object.entries(SECTORS)
			.map(([id, label]) => `<option value="${esc(id)}"${sector === id ? ' selected' : ''}>${esc(label)}</option>`)
			.join('')}</select></label>
    <label>Level<select name="level"><option value="">All</option>${['age', 'ccaa', 'local']
			.map((value) => `<option value="${value}"${level === value ? ' selected' : ''}>${value}</option>`)
			.join('')}</select></label>
    <label>Status<select name="status"><option value="">All</option>${['active', 'degraded', 'unknown']
			.map((value) => `<option value="${value}"${status === value ? ' selected' : ''}>${value}</option>`)
			.join('')}</select></label>
    <label>Format<input name="format" value="${esc(options.format ?? '')}" placeholder="csv"></label>
    <button class="btn primary" type="submit">Filter</button>
  </form>
  ${cards ? `<div class="grid two">${cards}</div>` : '<div class="empty">No sources match these filters.</div>'}
</div>`;

	return layout({
		title: 'Sources',
		description: 'Browse data sources in the Spanish public data catalog.',
		path: '/sources',
		body,
		current: 'sources',
	});
}

export function sourcePage(source: Source): string {
	const related = source.related
		?.map((id) => {
			const target = SOURCE_BY_ID.get(id);
			return target ? `<a href="/sources/${esc(id)}">${esc(target.name)}</a>` : esc(id);
		})
		.join(' · ');

	const endpoints = source.endpoints.length
		? `<div class="table-wrap"><table><thead><tr><th scope="col">Endpoint</th><th scope="col">What it returns</th></tr></thead><tbody>${source.endpoints
				.map((endpoint) => `<tr><td><code>${esc(endpoint.path)}</code></td><td>${esc(endpoint.desc)}</td></tr>`)
				.join('')}</tbody></table></div>`
		: '<p class="muted">No endpoints recorded.</p>';

	const code = source.code
		? `<section aria-labelledby="code"><h2 id="code">Code that already resolves it</h2>
       <p class="muted">Module <code>${esc(source.code.module)}</code>${source.code.mcp?.length ? ` · MCP tool ${source.code.mcp.map((tool) => `<code>${esc(tool)}</code>`).join(', ')}` : ''}</p>
       ${list(source.code.use)}</section>`
		: '';

	const sync = source.sync
		? `<section aria-labelledby="sync"><h2 id="sync">Sync and bulk download</h2><dl class="facts">${Object.entries(source.sync)
				.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`)
				.join('')}</dl></section>`
		: '';

	const body = `
<div class="wrap">
  <p class="crumbs"><a href="/">Home</a> / <a href="/sources">Sources</a> / ${esc(source.id)}</p>
  <div class="page-head">
    <h1>${esc(source.name)}</h1>
    <p>${esc(source.summary)}</p>
  </div>
  <div class="meta" style="display:flex;flex-wrap:wrap;gap:7px;margin:-18px 0 30px">
    ${badge(source.id, 'yellow')}${badge(source.level)}${badge(source.status, source.status === 'active' ? 'green' : 'red')}${badge(source.auth)}${source.access.map((access) => badge(access, 'blue')).join('')}${badge(SECTORS[source.sector] ?? source.sector)}
  </div>

  ${source.alerts?.length ? `<div class="danger" style="margin-bottom:26px"><strong>Read these first: silent traps.</strong>${list(source.alerts)}</div>` : ''}

  <section aria-labelledby="facts"><h2 id="facts">Fact sheet</h2>
    <dl class="facts">
      <dt>Organisation</dt><dd>${esc(source.org)}</dd>
      ${source.ministry ? `<dt>Ministry</dt><dd>${esc(source.ministry)}</dd>` : ''}
      <dt>Formats</dt><dd>${source.formats.map((format) => `<code>${esc(format)}</code>`).join(' ')}</dd>
      <dt>Update</dt><dd>${esc(source.update)}</dd>
      <dt>Coverage</dt><dd>${esc(source.coverage)}</dd>
      <dt>Licence</dt><dd>${esc(source.license)}</dd>
      <dt>Base URL</dt><dd><a href="${esc(source.base_url)}">${esc(source.base_url)}</a></dd>
      ${source.docs_url ? `<dt>Docs</dt><dd><a href="${esc(source.docs_url)}">${esc(source.docs_url)}</a></dd>` : ''}
      <dt>Verified</dt><dd>${esc(source.verified ?? 'not recorded')}</dd>
      ${source.ids?.length ? `<dt>Identifiers</dt><dd>${source.ids.map((id) => `<code>${esc(id)}</code>`).join(' ')}</dd>` : ''}
    </dl>
  </section>

  <section aria-labelledby="endpoints"><h2 id="endpoints">Endpoints</h2>${endpoints}</section>

  ${source.tips?.length ? `<section aria-labelledby="tips"><h2 id="tips">Tips</h2>${list(source.tips)}</section>` : ''}
  ${source.quirks?.length ? `<section aria-labelledby="quirks"><h2 id="quirks">Client quirks</h2>${list(source.quirks)}</section>` : ''}
  ${source.gotchas?.length ? `<section aria-labelledby="gotchas"><h2 id="gotchas">Verified gotchas</h2>${list(source.gotchas)}</section>` : ''}
  ${source.rate_limit ? `<section aria-labelledby="rate"><h2 id="rate">Rate limit</h2><p class="muted">${esc(source.rate_limit)}</p></section>` : ''}
  ${sync}
  ${code}
  ${related ? `<section aria-labelledby="related"><h2 id="related">Related sources</h2><p>${related}</p></section>` : ''}

  <p class="muted small">Machine-readable: <a href="/sources/${esc(source.id)}.json">record JSON</a> · <a href="/catalog.json">full catalog</a></p>
</div>`;

	return layout({
		title: source.name,
		description: source.summary.slice(0, 180),
		path: `/sources/${source.id}`,
		body,
		current: 'sources',
	});
}

export function productsPage(): string {
	const cards = PRODUCTS.map(
		(product: Product) => `<article class="card">
      <h3>${esc(product.producto)}</h3>
      <p><strong style="color:var(--text)">For:</strong> ${esc(product.cliente)}</p>
      <dl class="facts" style="margin-top:14px">
        <dt>Freshness</dt><dd>${esc(product.frescura)}</dd>
        <dt>Volume</dt><dd>${esc(product.volumen)}</dd>
        <dt>Licence</dt><dd>${esc(product.licencia)}</dd>
        <dt>Pitfall</dt><dd>${esc(product.trampa)}</dd>
      </dl>
      <div class="meta">${product.fuentes.map((source) => `<a class="tag yellow" href="/sources/${esc(source)}">${esc(source)}</a>`).join('')}${product.recetas.map((recipe) => `<a class="tag" href="/recipes/${esc(recipe)}">${esc(recipe)}</a>`).join('')}</div>
    </article>`,
	).join('');

	const body = `
<div class="wrap">
  <div class="page-head"><p class="crumbs"><a href="/">Home</a> / Products</p><h1>What can be built today</h1><p>${PRODUCTS.length} products with the sources and recipes each one needs, its freshness, volume, licence and the first pitfall to handle.</p></div>
  <div class="grid two">${cards}</div>
</div>`;

	return layout({
		title: 'Products',
		description: 'Data products that can be built from the Spanish public data catalog.',
		path: '/products',
		body,
		current: 'products',
	});
}

export function recipesPage(): string {
	const cards = RECIPES.map(
		(recipe: Recipe) => `<article class="card">
      <h3><a href="/recipes/${esc(recipe.id)}">${esc(recipe.intent)}</a></h3>
      <div class="meta">${badge(recipe.id, 'yellow')}${[...new Set(recipe.steps.map((step) => step.source))].map((source) => `<a class="tag" href="/sources/${esc(source)}">${esc(source)}</a>`).join('')}${recipe.verified ? badge(`verified ${recipe.verified}`, 'green') : ''}</div>
      <p style="margin-top:12px">${esc(recipe.output)}</p>
    </article>`,
	).join('');

	const body = `
<div class="wrap">
  <div class="page-head"><p class="crumbs"><a href="/">Home</a> / Recipes</p><h1>Recipes by intent</h1><p>${RECIPES.length} ordered procedures that combine sources. Each one includes the exact request, the expected output and verification checks.</p></div>
  <div class="grid two">${cards}</div>
</div>`;

	return layout({
		title: 'Recipes',
		description: 'Ordered recipes that combine Spanish public data sources.',
		path: '/recipes',
		body,
		current: 'recipes',
	});
}

export function recipePage(recipe: Recipe): string {
	const steps = recipe.steps
		.map(
			(step, index) => `<li style="margin-bottom:16px"><strong>${index + 1}. <a href="/sources/${esc(step.source)}">${esc(step.source)}</a></strong>
      <p style="margin:4px 0 0">${esc(step.do)}</p>
      ${step.example ? `<pre class="code" style="margin-top:8px"><code>${esc(step.example)}</code></pre>` : ''}</li>`,
		)
		.join('');

	const checks = recipe.checks?.length
		? `<section aria-labelledby="checks"><h2 id="checks">Verification checks</h2><div class="table-wrap"><table><thead><tr><th scope="col">URL</th><th scope="col">Must contain</th></tr></thead><tbody>${recipe.checks
				.map((check) => `<tr><td><code>${esc(check.url)}</code></td><td><code>${esc(check.contains)}</code></td></tr>`)
				.join('')}</tbody></table></div></section>`
		: '';

	const body = `
<div class="wrap">
  <p class="crumbs"><a href="/">Home</a> / <a href="/recipes">Recipes</a> / ${esc(recipe.id)}</p>
  <div class="page-head"><h1>${esc(recipe.intent)}</h1><p>${esc(recipe.output)}</p></div>
  <div class="meta" style="display:flex;gap:7px;flex-wrap:wrap;margin:-18px 0 30px">${badge(recipe.id, 'yellow')}${recipe.verified ? badge(`verified ${recipe.verified}`, 'green') : ''}${recipe.inputs.map((input) => badge(`input: ${input}`)).join('')}</div>
  ${recipe.note ? `<div class="notice" style="margin-bottom:24px">${esc(recipe.note)}</div>` : ''}
  <section aria-labelledby="steps"><h2 id="steps">Steps</h2><ol style="padding-left:0;list-style:none">${steps}</ol></section>
  ${checks}
</div>`;

	return layout({
		title: recipe.intent,
		description: recipe.intent,
		path: `/recipes/${recipe.id}`,
		body,
		current: 'recipes',
	});
}

export function identifiersPage(): string {
	const groups = Object.entries(IDENTIFIERS)
		.map(
			([id, identifier]) => `<article class="card" id="${esc(id)}">
      <h3 class="mono" style="color:var(--yellow);font-size:.9rem">${esc(id)}</h3>
      <p>${esc(identifier.format)}</p>
      <div class="meta">${identifier.example ? badge(`e.g. ${identifier.example}`, 'green') : ''}${identifier.issuer ? badge(identifier.issuer) : ''}${identifier.regex ? `<span class="tag mono">${esc(identifier.regex)}</span>` : ''}</div>
      ${identifier.gotcha ? `<p class="small" style="margin-top:12px"><strong style="color:var(--text)">Pitfall:</strong> ${esc(identifier.gotcha)}</p>` : ''}
      ${identifier.joins?.length ? `<details class="client" style="margin-top:12px"><summary>${identifier.joins.length} joins</summary><div>${list(identifier.joins.map((join) => `${join.via}: ${join.how}`))}</div></details>` : ''}
    </article>`,
		)
		.join('');

	const body = `
<div class="wrap">
  <div class="page-head"><p class="crumbs"><a href="/">Home</a> / Identifiers</p><h1>Identifiers and joins</h1><p>${Object.keys(IDENTIFIERS).length} keys used across Spanish public data, with format, example, issuer, joins and the pitfall that breaks a join.</p></div>
  <div class="grid two">${groups}</div>
</div>`;

	return layout({
		title: 'Identifiers',
		description: 'Identifiers and join keys used across Spanish public data.',
		path: '/identifiers',
		body,
		current: 'identifiers',
	});
}

export function notFoundPage(path: string): string {
	const body = `
<div class="wrap">
  <div class="empty" style="margin-top:40px">
    <p class="eyebrow">404</p>
    <h1 style="font-size:2rem">Not found</h1>
    <p>No page for <code>${esc(path)}</code>.</p>
    <p style="margin-top:18px"><a class="btn" href="/">Back to the overview</a> <a class="btn ghost" href="/sources">Browse sources</a></p>
  </div>
</div>`;
	return layout({ title: 'Not found', description: 'Page not found.', path, body });
}

export function healthPayload() {
	const summary = catalogSummary();
	return {
		status: 'ok',
		name: SERVER_INFO.name,
		version: SERVER_INFO.version,
		origin: PUBLIC_ORIGIN,
		protocol: { modern: '2026-07-28', legacy: '2025-11-25' },
		catalog: {
			generated: summary.generated,
			sources: summary.counts.sources,
			products: summary.counts.products,
			recipes: summary.counts.recipes,
			needs: summary.counts.needs,
			identifiers: summary.counts.identifiers,
		},
		time: new Date().toISOString(),
	};
}

export function robotsTxt(): string {
	return `User-agent: *
Allow: /
Disallow: /mcp
Disallow: /sse
Disallow: /messages

Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml
`;
}

export function sitemapXml(): string {
	const paths = [
		'/',
		'/sources',
		'/products',
		'/recipes',
		'/identifiers',
		'/search',
		...SOURCES.map((source) => `/sources/${source.id}`),
		...RECIPES.map((recipe) => `/recipes/${recipe.id}`),
	];
	const urls = paths
		.map((path) => `  <url><loc>${PUBLIC_ORIGIN}${path}</loc></url>`)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function faviconSvg(): string {
	return SYMBOL.replace('width="40" height="40"', 'width="64" height="64"');
}

export function sourceJson(source: Source): string {
	return JSON.stringify(getRecord(source.id));
}
