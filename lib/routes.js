// 浏览器侧 API：/dsh-kb/api/*
// 与 memory-palace 相同的信任栅栏（同源 + loopback/受信主机），只暴露资料库需要的操作。
import { extname } from 'node:path';

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
                writeOk(response, { ok: true, version: config.version ?? '1.0.0', ...stats });
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
            await dispatch({ route, body, runtime, response });
          } catch (error) {
            writeError(response, error);
          }
        },
      }),
    'dsh-knowledge-base: /dsh-kb/api routes',
  );
}

async function dispatch({ route, body, runtime, response }) {
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
  response.writeHead(200, {
    'content-type': mimeOf(name),
    'content-length': String(buffer.length),
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    'cache-control': 'private, max-age=60',
  });
  response.end(buffer);
}
