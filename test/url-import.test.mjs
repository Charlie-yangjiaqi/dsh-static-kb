import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../lib/runtime.js';
import { registerRoutes } from '../lib/routes.js';

function makeHarness(dataDir) {
  const routes = [];
  const ctx = {
    get(name) {
      if (name === 'webStartup') return { trustedHosts: [] };
      return undefined;
    },
    effect(callback) {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    on() {
      return () => {};
    },
    logger: { error() {}, warn() {}, debug() {} },
    webServer: {
      register(route) {
        routes.push(route);
        return () => {};
      },
    },
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {} },
  };
  const runtime = createRuntime({ ctx, config: { dataDir } });
  registerRoutes({ ctx, runtime, config: { dataDir } });
  return { runtime, routes };
}

async function call(routes, route, body) {
  const handler = routes[0].handler;
  const request = {
    method: 'POST',
    url: `/dsh-kb/api/${route}`,
    headers: { host: '127.0.0.1:50965', 'sec-fetch-site': 'same-origin' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body ?? {}), 'utf8');
    },
  };
  const response = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(chunk) {
      this.body = chunk;
    },
  };
  await handler(request, response);
  return { status: response.status, json: JSON.parse(response.body) };
}

test('doc.url fetches a public page and stores it as an html document', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-url-'));
  const harness = makeHarness(dataDir);
  const originalFetch = globalThis.fetch;
  const html = '<html><head><title>示例页面</title></head><body><h1>示例页面</h1><p>这是用于测试网址导入的正文段落。</p><p>第二段。</p></body></html>';
  try {
    await harness.runtime.ready();
    const kb = await harness.runtime.store.createKb({ title: '网页库' });
    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'https://example.com/docs/page');
      return new Response(Buffer.from(html, 'utf8'), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    };
    const result = await call(harness.routes, 'doc.url', { kbId: kb.id, url: 'https://example.com/docs/page' });
    assert.equal(result.json.ok, true, result.body);
    assert.equal(result.json.value.doc.kind, 'html');
    assert.equal(result.json.value.doc.status, 'imported');
    assert.equal(result.json.value.doc.sourceUrl, 'https://example.com/docs/page');
    assert.match(result.json.value.doc.title, /page/);

    const preview = await call(harness.routes, 'doc.preview', { kbId: kb.id, docId: result.json.value.doc.id });
    assert.match(preview.json.value.text, /测试网址导入/);

    const rejected = await call(harness.routes, 'doc.url', { kbId: kb.id, url: 'http://127.0.0.1:50965/' });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.json.error.code, 'bad-url');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('doc.reveal refuses documents without a converted file', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-reveal-'));
  const harness = makeHarness(dataDir);
  try {
    await harness.runtime.ready();
    const kb = await harness.runtime.store.createKb({ title: '定位测试' });
    const { doc } = await harness.runtime.store.addText({ kbId: kb.id, title: '未转化', text: '一段还没有转化过的文本内容。' });
    const result = await call(harness.routes, 'doc.reveal', { kbId: kb.id, docId: doc.id });
    assert.equal(result.json.ok, false);
    assert.equal(result.json.error.code, 'not-found');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
