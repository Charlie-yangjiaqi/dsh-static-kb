// 用本机 Edge 的无头模式渲染真实 DSH 页面，打开资料库面板并截图（只读验证，不改用户浏览器）。
// 用法：node tools/ui-shot.mjs <GUI_URL> [outDir]
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const outDir = process.argv[3] || join(process.cwd(), '.shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;

if (!url) {
  console.error('usage: node tools/ui-shot.mjs <GUI_URL> [outDir]');
  process.exit(2);
}

const profile = await mkdtemp(join(tmpdir(), 'dshkb-edge-'));
await mkdir(outDir, { recursive: true });

const child = spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cdpTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((response) => response.json());
      const page = list.find((item) => item.type === 'page');
      if (page !== undefined) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(300);
  }
  throw new Error('Edge CDP 未就绪');
}

const wsUrl = await cdpTarget();
const socket = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const events = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined) {
    const entry = pending.get(message.id);
    if (entry !== undefined) {
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') events.push({ type: 'exception', detail: message.params?.exceptionDetails?.text });
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    events.push({ type: 'console.error', detail: (message.params.args || []).map((arg) => arg.value ?? arg.description).join(' ') });
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}

async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const path = join(outDir, name);
  await writeFile(path, Buffer.from(result.data, 'base64'));
  console.log('saved', path);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(7000);

  const sanity = await evaluate('({ title: document.title, hasBoot: typeof window.__DSH_BOOT__ === "object", footer: !!document.querySelector(".dshkb-footer-btn"), dock: !!document.querySelector(".dshkb-dock"), overlay: !!document.querySelector(".dshkb-backdrop") })');
  console.log('sanity:', JSON.stringify(sanity));
  await shot('01-home.png');

  const clickFooter = await evaluate('(() => { const b = document.querySelector(".dshkb-footer-btn"); if (!b) return "footer-missing"; b.click(); return "clicked"; })()');
  console.log('click footer:', clickFooter);
  await sleep(1800);

  const panelState = await evaluate('(() => { const card = document.querySelector(".dshkb-card"); return { panel: !!card, kbs: document.querySelectorAll(".dshkb-kb-row").length, docs: document.querySelectorAll(".dshkb-doc-row").length, tabs: [...document.querySelectorAll(".dshkb-tab")].map((el) => el.textContent) }; })()');
  console.log('panel:', JSON.stringify(panelState));
  await shot('02-panel.png');

  const clickDock = await evaluate('(() => { const b = document.querySelector(".dshkb-dock-actions button"); if (!b) return "dock-missing"; b.click(); return "clicked"; })()');
  console.log('click dock action:', clickDock);
  await sleep(1500);

  const bindMode = await evaluate('(() => ({ panel: !!document.querySelector(".dshkb-card"), bindButtons: [...document.querySelectorAll(".dshkb-btn-primary")].map((el) => el.textContent).slice(0, 6) }))()');
  console.log('bind mode:', JSON.stringify(bindMode));
  await shot('03-bind-mode.png');

  console.log('events:', JSON.stringify(events.slice(0, 20)));
} finally {
  try {
    await send('Browser.close');
  } catch {
    /* ignore */
  }
  await sleep(500);
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
