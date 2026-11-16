// 浏览器侧 API：/dsh-kb/api/*
// 与 memory-palace 相同的信任栅栏（同源 + loopback/受信主机），只暴露资料库需要的操作。
import { extname, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { chatCompletion, normalizeBaseURL } from './openai.js';
import { clearConversionKey, maskKey, readConversionKey, writeConversionKey } from './settings.js';

const API_PREFIX = '/dsh-kb/api';
const MAX_BODY_BYTES = 48 * 1024 * 1024;

const MIME_BY_EXTENSION = new Map([
  ['.pdf', 'application/pdf'],
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.markdown', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.epub', 'application/epub+zip'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
]);

function header(headers, name) {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function parseAuthority(value) {
  try {
    return new URL(`http://${value}`);
  } catch {
    return undefined;
  }
}

function trustedHostList(ctx) {
  try {
    const startup = ctx.get?.('webStartup');
    const hosts = startup?.trustedHosts;
    return Array.isArray(hosts) ? hosts.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function isTrustedRequest(ctx, request) {
  const host = header(request.headers, 'host');
  if (host === undefined) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === undefined) return false;
  const trusted = trustedHostList(ctx);
  const trustedMatch = trusted.some((entry) => {
    const entryUrl = parseAuthority(entry);
    if (entryUrl === undefined) return false;
    return entryUrl.host === hostUrl.host;
  });
  if (!isLoopbackHostname(hostUrl.hostname) && !trustedMatch) return false;
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false;
  const origin = header(request.headers, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw httpError(413, 'payload-too-large', '请求体过大（上限 48 MB）');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, 'bad-json', '请求体不是合法 JSON');
  }
}

function writeJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(payload);
}

function writeOk(response, value) {
  writeJson(response, 200, { ok: true, value });
}

function writeError(response, error) {
  writeJson(response, error?.status ?? 500, {
    ok: false,
    error: { code: error?.code ?? 'internal', message: error instanceof Error ? error.message : String(error) },
  });
}

function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function mimeOf(name) {
  return MIME_BY_EXTENSION.get(extname(String(name || '')).toLowerCase()) ?? 'application/octet-stream';
}

const MAX_REMOTE_BYTES = 8 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 15000;

function isPublicHttpUrl(input) {
  let parsed;
  try {
    parsed = new URL(String(input));
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return null;
  if (hostname === '::1' || hostname === '0.0.0.0') return null;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4 !== null) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0) return null;
  }
  if (/^f[cd][0-9a-f]{2}:/i.test(hostname)) return null; // 私有 IPv6
  return parsed;
}

function fileNameForUrl(parsed) {
  const slug = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
  const clean = slug.replace(/\.[a-z0-9]{1,6}$/i, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'page';
  return `${clean}.html`;
}

async function fetchRemotePage(rawUrl) {
  const parsed = isPublicHttpUrl(rawUrl);
  if (parsed === null) throw httpError(400, 'bad-url', '只支持 http/https 公网网址');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'dsh-knowledge-base/1.0 (+local)', accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    });
    if (!response.ok) throw httpError(502, 'fetch-failed', `抓取失败：HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > MAX_REMOTE_BYTES) throw httpError(413, 'too-large', '页面超过 8 MB 上限');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_REMOTE_BYTES) throw httpError(413, 'too-large', '页面超过 8 MB 上限');
    if (buffer.length === 0) throw httpError(502, 'empty-page', '页面内容为空');
    return { buffer, name: fileNameForUrl(parsed), url: parsed.href };
  } catch (error) {
    if (error?.code === 'ABORT_ERR' || error?.name === 'AbortError') throw httpError(504, 'timeout', '抓取超时（15 秒）');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** 在系统文件管理器里定位一个文件（Windows 资源管理器 / macOS Finder / Linux）。 */
function revealInFileManager(target) {
  const platform = process.platform;
  const command = platform === 'win32' ? 'explorer.exe' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/select,', target] : platform === 'darwin' ? ['-R', target] : [target];
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
    } catch (error) {
      resolvePromise({ ok: false, message: error instanceof Error ? error.message : String(error) });
      return;
    }
    child.on('error', (error) => resolvePromise({ ok: false, message: error.message }));
    // explorer.exe 常以非 0 退出但窗口已经打开，不能按退出码判断失败。
    child.on('spawn', () => {
      child.unref();
      resolvePromise({ ok: true });
    });
  });
}

export { isPublicHttpUrl, fileNameForUrl };

export function registerRoutes({ ctx, runtime, config = {} }) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: async (request, response) => {
          try {
            if (!isTrustedRequest(ctx, request)) {
              writeJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
              return;
            }
            const url = new URL(request.url ?? '/', 'http://dsh.internal');
            const route = url.pathname.startsWith(`${API_PREFIX}/`) ? url.pathname.slice(API_PREFIX.length + 1) : '';

            if (request.method === 'GET') {
              if (route === 'health') {
                await runtime.ready();
                const stats = await runtime.store.stats();
                writeOk(response, { ok: true, ...stats });
                return;
              }
              if (route === 'raw') {
                await streamRaw({ runtime, response, url });
                return;
              }
              writeJson(response, 405, { ok: false, error: { code: 'method-not-allowed', message: '仅支持 POST' } });
              return;
            }

            if (request.method !== 'POST') {
              writeJson(response, 405, { ok: false, error: { code: 'method-not-allowed', message: '仅支持 POST' } });
              return;
            }
            const body = await readJsonBody(request);
            await dispatch({ route, body, runtime, response, ctx });
          } catch (error) {
            writeError(response, error);
          }
        },
      }),
    'dsh-knowledge-base: /dsh-kb/api routes',
  );
}

async function dispatch({ route, body, runtime, response, ctx }) {
  const store = runtime.store;
  await runtime.ready();

  switch (route) {
    case 'overview': {
      const value = await runtime.overview(typeof body.sessionId === 'string' ? body.sessionId : undefined);
      writeOk(response, value);
      return;
    }
    case 'kb.create': {
      const kb = await store.createKb({ title: body.title, description: body.description });
      writeOk(response, kb);
      return;
    }
    case 'kb.update': {
      const kb = await store.updateKb(String(body.kbId ?? ''), { title: body.title, description: body.description });
      writeOk(response, kb);
      return;
    }
    case 'kb.delete': {
      writeOk(response, await store.deleteKb(String(body.kbId ?? '')));
      return;
    }
    case 'docs.list': {
      writeOk(response, await store.listDocs(String(body.kbId ?? '')));
      return;
    }
    case 'doc.import': {
      if (typeof body.name !== 'string' || typeof body.dataBase64 !== 'string') {
        throw httpError(400, 'bad-request', '缺少 name 或 dataBase64');
      }
      const buffer = Buffer.from(body.dataBase64, 'base64');
      const result = await store.addFile({ kbId: String(body.kbId ?? ''), name: body.name, mime: body.mime, buffer });
      writeOk(response, result);
      return;
    }
    case 'doc.paste': {
      writeOk(
        response,
        await store.addText({
          kbId: String(body.kbId ?? ''),
          title: body.title,
          text: body.text,
          sourceUrl: typeof body.sourceUrl === 'string' && body.sourceUrl !== '' ? body.sourceUrl : null,
        }),
      );
      return;
    }
    case 'doc.url': {
      const fetched = await fetchRemotePage(String(body.url ?? ''));
      writeOk(
        response,
        await store.addRemotePage({
          kbId: String(body.kbId ?? ''),
          url: fetched.url,
          name: fetched.name,
          buffer: fetched.buffer,
          title: body.title,
        }),
      );
      return;
    }
    case 'doc.preview': {
      writeOk(
        response,
        await store.readPreview(String(body.kbId ?? ''), String(body.docId ?? ''), {
          offset: Number.isFinite(body.offset) ? body.offset : 0,
          limit: Number.isFinite(body.limit) ? body.limit : 20000,
        }),
      );
      return;
    }
    case 'settings.get': {
      const conversion = await runtime.settings.get();
      const key = await readConversionKey(ctx);
      writeOk(response, { ...conversion, hasKey: typeof key === 'string' && key !== '', keyMask: maskKey(key) });
      return;
    }
    case 'settings.update': {
      const patch = {};
      if (typeof body.baseURL === 'string') {
        const baseURL = normalizeBaseURL(body.baseURL);
        if (body.baseURL.trim() !== '' && baseURL === '') {
          throw httpError(400, 'bad-request', '服务地址必须以 http:// 或 https:// 开头');
        }
        patch.baseURL = baseURL;
      }
      if (typeof body.model === 'string') patch.model = body.model;
      if (typeof body.visionModel === 'string') patch.visionModel = body.visionModel;
      if (typeof body.vision === 'boolean') patch.vision = body.vision;
      if (typeof body.verify === 'boolean') patch.verify = body.verify;
      if (Number.isFinite(body.maxImages)) patch.maxImages = body.maxImages;
      if (Number.isFinite(body.temperature)) patch.temperature = body.temperature;
      if (Number.isFinite(body.concurrency)) patch.concurrency = body.concurrency;
      if (Number.isFinite(body.rasterScale)) patch.rasterScale = body.rasterScale;
      const conversion = await runtime.settings.update(patch);
      if (body.clearKey === true) await clearConversionKey(ctx);
      else if (typeof body.apiKey === 'string' && body.apiKey.trim() !== '') await writeConversionKey(ctx, body.apiKey.trim());
      const key = await readConversionKey(ctx);
      writeOk(response, { ...conversion, hasKey: typeof key === 'string' && key !== '', keyMask: maskKey(key) });
      return;
    }
    case 'settings.test': {
      const conversion = await runtime.settings.get();
      const storedKey = await readConversionKey(ctx);
      const key = typeof body.apiKey === 'string' && body.apiKey.trim() !== '' ? body.apiKey.trim() : storedKey;
      if (typeof key !== 'string' || key === '') throw httpError(400, 'no-key', '还没有配置 API Key');
      const model = typeof body.model === 'string' && body.model.trim() !== '' ? body.model.trim() : conversion.model;
      const baseURL = typeof body.baseURL === 'string' && body.baseURL.trim() !== '' ? normalizeBaseURL(body.baseURL) : conversion.baseURL;
      if (baseURL === '' || model === '') throw httpError(400, 'bad-request', '请先填写服务地址和模型');
      const started = Date.now();
      try {
        await chatCompletion({
          baseURL,
          apiKey: key,
          model,
          messages: [{ role: 'user', content: [{ type: 'text', text: '回复 OK 两个字母即可。' }] }],
          maxTokens: 512,
          temperature: 0,
          timeoutMs: 30000,
        });
        writeOk(response, { ok: true, latencyMs: Date.now() - started, model });
      } catch (error) {
        writeOk(response, { ok: false, latencyMs: Date.now() - started, model, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    case 'doc.reveal': {
      const kbId = String(body.kbId ?? '');
      const docId = String(body.docId ?? '');
      const { kb, doc } = await store.getDoc(kbId, docId);
      const wantMarkdown = body.target !== 'raw';
      const rel = wantMarkdown ? doc.mdPath : (doc.rawPath ?? doc.mdPath);
      if (typeof rel !== 'string' || rel === '') throw httpError(404, 'not-found', '这篇文档还没有转化文件');
      const root = resolve(runtime.dataDir);
      const target = resolve(join(root, kb.id, rel));
      if (target !== root && !target.startsWith(`${root}${sep}`)) throw httpError(400, 'bad-path', '文件不在资料库目录内');
      const result = await revealInFileManager(target);
      if (!result.ok) {
        writeOk(response, { opened: false, path: target, hint: `无法自动打开文件管理器，路径：${target}` });
        return;
      }
      writeOk(response, { opened: true, path: target });
      return;
    }
    case 'doc.delete': {
      writeOk(response, await store.deleteDoc(String(body.kbId ?? ''), String(body.docId ?? '')));
      return;
    }
    case 'doc.rawtext': {
      writeOk(response, await store.readRawText(String(body.kbId ?? ''), String(body.docId ?? '')));
      return;
    }
    case 'doc.convert': {
      const { job } = await runtime.startConversion(String(body.kbId ?? ''), String(body.docId ?? ''), { force: body.force === true });
      writeOk(response, job);
      return;
    }
    case 'doc.continue': {
      const { job, skipped } = await runtime.startConversion(String(body.kbId ?? ''), String(body.docId ?? ''), { continue: true });
      writeOk(response, { ...job, skipped: skipped === true });
      return;
    }
    case 'doc.markdown': {
      const value = await store.readMarkdown(String(body.kbId ?? ''), String(body.docId ?? ''));
      writeOk(response, {
        text: value.text,
        truncated: value.truncated,
        doc: {
          id: value.doc.id,
          title: value.doc.title,
          chars: value.doc.chars,
          model: value.doc.model,
          conversionMode: value.doc.conversionMode ?? null,
        },
      });
      return;
    }
    case 'doc.clearError': {
      await store.clearDocError(String(body.kbId ?? ''), String(body.docId ?? ''));
      writeOk(response, { cleared: true });
      return;
    }
    case 'job.get': {
      const job = runtime.getJob(String(body.id ?? ''));
      if (job === null) throw httpError(404, 'not-found', '任务不存在或已过期');
      writeOk(response, job);
      return;
    }
    case 'job.cancel': {
      writeOk(response, { cancelled: runtime.cancelJob(String(body.id ?? '')) });
      return;
    }
    case 'bind.set': {
      writeOk(response, await store.bind(String(body.sessionId ?? ''), typeof body.kbId === 'string' && body.kbId !== '' ? body.kbId : null));
      return;
    }
    case 'binding.get': {
      writeOk(response, await store.bindingOf(String(body.sessionId ?? '')));
      return;
    }
    default:
      throw httpError(404, 'not-found', `未知接口 ${route}`);
  }
}

async function streamRaw({ runtime, response, url }) {
  const kbId = url.searchParams.get('kbId') ?? '';
  const docId = url.searchParams.get('docId') ?? '';
  const { buffer, doc } = await runtime.store.readRaw(kbId, docId);
  const name = String(doc.sourceName ?? doc.title ?? 'file');
  const extension = extname(name).toLowerCase();
  // HTML/SVG 一律作为附件下载：内联会让抓来的页面在 DSH 同源执行脚本，可反过来调用本插件 API。
  const inline = extension !== '.html' && extension !== '.htm' && extension !== '.svg';
  response.writeHead(200, {
    'content-type': mimeOf(name),
    'content-length': String(buffer.length),
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'x-content-type-options': 'nosniff',
    ...(inline ? {} : { 'content-security-policy': "sandbox; default-src 'none'" }),
    'cache-control': 'private, max-age=60',
  });
  response.end(buffer);
}
