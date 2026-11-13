import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../lib/runtime.js';
import { registerPrompt } from '../lib/prompt.js';
import { registerRoutes } from '../lib/routes.js';
import { registerTools } from '../lib/tools.js';

function fakeLlm(output) {
  return {
    async *stream() {
      yield { type: 'text-delta', index: 0, text: output };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
}

function makeHarness({ llm, dataDir }) {
  const tools = new Map();
  const routes = [];
  let section = null;
  const ctx = {
    get(name) {
      if (name === 'webStartup') return { trustedHosts: [] };
      if (name === 'llm') return llm;
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) };
      return undefined;
    },
    effect(callback) {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    on() {
      return () => {};
    },
    logger: { error() {}, warn() {}, info() {} },
    webServer: {
      register(route) {
        routes.push(route);
        return () => {};
      },
    },
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
        return () => {};
      },
    },
    systemPrompt: {
      section(definition) {
        section = definition;
        return () => {};
      },
    },
  };
  const runtime = createRuntime({ ctx, config: { dataDir } });
  return { ctx, runtime, tools, routes, sectionOf: () => section };
}

async function call(routes, route, body = {}, { method = 'POST', query = '' } = {}) {
  const handler = routes[0].handler;
  const payload = method === 'POST' ? Buffer.from(JSON.stringify(body), 'utf8') : Buffer.alloc(0);
  const request = {
    method,
    url: `/dsh-kb/api/${route}${query}`,
    headers: { host: '127.0.0.1:50965', 'sec-fetch-site': 'same-origin' },
    async *[Symbol.asyncIterator]() {
      if (method === 'POST') yield payload;
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
  if (response.headers['content-type']?.includes('application/json')) {
    return { status: response.status, json: JSON.parse(response.body) };
  }
  return { status: response.status, raw: response.body };
}

test('end-to-end: create library, import text, bind, convert, search, read', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-int-'));
  const llm = fakeLlm('<<<SUMMARY>>>\n讲实践与认识的关系。\n<<<TAGS>>>\n哲学, 认识论\n<<<CONTENT>>>\n# 实践论\n\n实践是检验真理的唯一标准。');
  const harness = makeHarness({ llm, dataDir });
  try {
    await harness.runtime.ready();
    registerPrompt({ ctx: harness.ctx, runtime: harness.runtime });
    await registerTools({ ctx: harness.ctx, runtime: harness.runtime });
    registerRoutes({ ctx: harness.ctx, runtime: harness.runtime, config: { dataDir, version: 'test' } });

    // 健康检查
    const health = await call(harness.routes, 'health', {}, { method: 'GET' });
    assert.equal(health.status, 200);
    assert.equal(health.json.value.ok, true);

    // 新建资料库
    const created = await call(harness.routes, 'kb.create', { title: '毛泽东选集资料库', description: '哲学' });
    assert.equal(created.json.ok, true);
    const kbId = created.json.value.id;

    // 粘贴文本
    const pasted = await call(harness.routes, 'doc.paste', { kbId, title: '实践论', text: '实践是检验真理的唯一标准。' });
    assert.equal(pasted.json.value.doc.status, 'imported');
    const docId = pasted.json.value.doc.id;

    // 绑定到会话
    const bound = await call(harness.routes, 'bind.set', { sessionId: 'session-test', kbId });
    assert.equal(bound.json.value.title, '毛泽东选集资料库');

    // 系统提示词注入规则与目录
    const section = harness.sectionOf();
    const promptText = section.text({ agent: { session: { id: 'session-test' } } });
    assert.match(promptText, /资料库优先/);
    assert.match(promptText, /ask_user_question/);
    assert.match(promptText, /毛泽东选集资料库/);
    assert.equal(section.text({ agent: { session: { id: 'session-other' } } }), '');

    // 未转化前不可检索
    const before = await harness.tools.get('kb_search').execute({ query: '真理' }, { agent: { session: { id: 'session-test' } } });
    assert.match(before, /没有检索到/);

    // 转化
    const convert = await call(harness.routes, 'doc.convert', { kbId, docId });
    assert.equal(convert.json.ok, true);
    let job = convert.json.value;
    for (let attempt = 0; attempt < 50 && job.status === 'running'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const polled = await call(harness.routes, 'job.get', { id: job.id });
      job = polled.json.value;
    }
    assert.equal(job.status, 'done', JSON.stringify(job.error));

    // 检索与读取
    const search = await harness.tools.get('kb_search').execute({ query: '真理' }, { agent: { session: { id: 'session-test' } } });
    assert.match(search, /实践论/);
    assert.match(search, /实践是检验真理的唯一标准/);

    const read = await harness.tools.get('kb_read').execute({ docId }, { agent: { session: { id: 'session-test' } } });
    assert.match(read, /# 实践论/);

    const written = await harness.tools
      .get('kb_write_doc')
      .execute({ title: '矛盾论', markdown: '# 矛盾论\n\n事物矛盾法则。', summary: '对立统一', tags: ['哲学'] }, { agent: { session: { id: 'session-test' } } });
    assert.match(written, /已新建/);

    const overview = await call(harness.routes, 'overview', { sessionId: 'session-test' });
    assert.equal(overview.json.value.kbs.length, 1);
    assert.equal(overview.json.value.kbs[0].readyCount, 2);
    assert.equal(overview.json.value.binding.title, '毛泽东选集资料库');

    // 解绑
    const unbound = await call(harness.routes, 'bind.set', { sessionId: 'session-test', kbId: null });
    assert.equal(unbound.json.value.kbId, null);
    assert.equal(harness.sectionOf().text({ agent: { session: { id: 'session-test' } } }), '');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('import file through the API and reject untrusted origins', async () => {  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-int2-'));
  const harness = makeHarness({ llm: fakeLlm('x'), dataDir });
  try {
    await harness.runtime.ready();
    registerRoutes({ ctx: harness.ctx, runtime: harness.runtime, config: { dataDir } });
    const kb = await harness.runtime.store.createKb({ title: '测试库' });
    const result = await call(harness.routes, 'doc.import', {
      kbId: kb.id,
      name: 'note.md',
      mime: 'text/markdown',
      dataBase64: Buffer.from('# 标题\n\n一段用于测试的正文。', 'utf8').toString('base64'),
    });
    assert.equal(result.json.ok, true);
    assert.equal(result.json.value.doc.kind, 'markdown');
    assert.equal(result.json.value.doc.status, 'imported');

    const handler = harness.routes[0].handler;
    const request = {
      method: 'POST',
      url: '/dsh-kb/api/overview',
      headers: { host: 'evil.example.com', 'sec-fetch-site': 'cross-site' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('{}');
      },
    };
    const response = { writeHead(status) { this.status = status; }, headers: {}, end(chunk) { this.body = chunk; } };
    await handler(request, response);
    assert.equal(response.status, 403);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
