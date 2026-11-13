// 入口装配测试：用 mock ctx 跑一遍 index.js 的 apply，确认路由、工具、提示词都真的挂上了。
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';

function makeContext({ dataDir, llm }) {
  const registered = { tools: [], sections: [], routes: [], effects: [] };
  const ctx = {
    get(name) {
      if (name === 'webStartup') return { trustedHosts: [] };
      if (name === 'llm') return llm;
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) };
      return undefined;
    },
    effect(callback, label) {
      const disposer = callback();
      registered.effects.push({ label, disposer });
      return () => {};
    },
    on() {
      return () => {};
    },
    logger: { error() {}, warn() {}, debug() {}, info() {} },
    webServer: {
      register(route) {
        registered.routes.push(route);
        return () => {};
      },
    },
    tools: {
      register(definition) {
        registered.tools.push(definition);
        return () => {};
      },
    },
    systemPrompt: {
      section(section) {
        registered.sections.push(section);
        return () => {};
      },
    },
  };
  return { ctx, registered };
}

async function post(routes, route, body) {
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

test('apply wires tools, prompt section, routes and abort effect', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-apply-'));
  const llm = {
    async *stream() {
      yield { type: 'text-delta', index: 0, text: '<<<SUMMARY>>>\n摘要\n<<<TAGS>>>\n标签\n<<<CONTENT>>>\n# 标题\n\n正文' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const { ctx, registered } = makeContext({ dataDir, llm });
  try {
    await apply(ctx, { dataDir });

    assert.equal(registered.tools.length, 7, 'seven kb tools registered');
    assert.deepEqual(
      registered.tools.map((tool) => tool.name).sort(),
      ['kb_convert', 'kb_list', 'kb_pending', 'kb_read', 'kb_search', 'kb_status', 'kb_write_doc'],
    );
    for (const tool of registered.tools) assert.equal(tool.parameters.type, 'object', tool.name);
    assert.equal(registered.sections.length, 1);
    assert.equal(registered.sections[0].name, 'knowledge-base');
    assert.equal(registered.routes.length, 1);
    assert.ok(registered.effects.some((entry) => /abort running conversions/.test(entry.label ?? '')));

    const created = await post(registered.routes, 'kb.create', { title: '装配测试库' });
    assert.equal(created.json.ok, true);

    // 未绑定会话时提示词为空
    assert.equal(registered.sections[0].text({ agent: { session: { id: 's-none' } } }), '');

    // 绑定后提示词包含资料库名与冲突条款
    const kbId = created.json.value.id;
    await post(registered.routes, 'bind.set', { sessionId: 's1', kbId });
    const prompt = registered.sections[0].text({ agent: { session: { id: 's1' } } });
    assert.match(prompt, /装配测试库/);
    assert.match(prompt, /ask_user_question/);
    assert.match(prompt, /以资料库为准/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
