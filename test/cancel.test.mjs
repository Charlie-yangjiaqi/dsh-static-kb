import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../lib/runtime.js';
import { writeConversionKey } from '../lib/settings.js';

function makeContext() {
  const records = new Map();
  return {
    get(name) {
      if (name === 'credentials') {
        return {
          async readRecord(key) {
            return records.get(key);
          },
          async modifyRecord(key, mutate) {
            const next = await mutate(records.get(key));
            if (next !== undefined) records.set(key, next);
            return next;
          },
          async deleteRecord(key) {
            records.delete(key);
          },
        };
      }
      if (name === 'webStartup') return { trustedHosts: [] };
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      return undefined;
    },
    effect(callback) {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    on() {
      return () => {};
    },
    logger: { error() {}, warn() {}, debug() {}, info() {} },
    webServer: { register: () => () => {} },
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {} },
  };
}

test('cancel marks the job cancelled immediately and never saves the result', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-cancel-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return new Response(JSON.stringify({ choices: [{ message: { content: '# 标题\n\n正文。' } }] }), { status: 200 });
  };
  try {
    const ctx = makeContext();
    const runtime = createRuntime({ ctx, config: { dataDir, chunkChars: 2000, maxChunks: 4, concurrency: 2 } });
    await runtime.ready();
    await runtime.settings.update({ baseURL: 'https://api.example.com/v1', model: 'm', concurrency: 2, verify: false, vision: false });
    await writeConversionKey(ctx, 'sk');
    const kb = await runtime.store.createKb({ title: '取消测试' });
    const { doc } = await runtime.store.addText({ kbId: kb.id, title: '取消', text: '取消测试正文。'.repeat(600) });

    const { job } = await runtime.startConversion(kb.id, doc.id);
    assert.equal(job.status, 'running');
    await new Promise((resolve) => setTimeout(resolve, 120));

    assert.equal(runtime.cancelJob(job.id), true);
    // 立刻变成已取消，不等底层 await 返回
    assert.equal(runtime.getJob(job.id).status, 'cancelled');

    await new Promise((resolve) => setTimeout(resolve, 2600));
    const listed = (await runtime.store.listDocs(kb.id))[0];
    assert.equal(listed.status, 'imported', '取消后不应写盘');
    assert.equal(listed.hasMarkdown, false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('cancelling the library batch cancels its running child jobs', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-cancel2-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return new Response(JSON.stringify({ choices: [{ message: { content: '<<<SUMMARY>>>\n摘要\n<<<TAGS>>>\n标签\n<<<CONTENT>>>\n# 标题\n\n正文。' } }] }), { status: 200 });
  };
  try {
    const ctx = makeContext();
    const runtime = createRuntime({ ctx, config: { dataDir, chunkChars: 2000, maxChunks: 1, concurrency: 1 } });
    await runtime.ready();
    await runtime.settings.update({ baseURL: 'https://api.example.com/v1', model: 'm', concurrency: 1, verify: false, vision: false });
    await writeConversionKey(ctx, 'sk');
    const kb = await runtime.store.createKb({ title: '批量取消' });
    for (const title of ['甲', '乙']) {
      await runtime.store.addText({ kbId: kb.id, title, text: '批量取消测试正文。'.repeat(400) });
    }

    const { job } = await runtime.startFullLibrary(kb.id);
    assert.equal(job.status, 'running');
    await new Promise((resolve) => setTimeout(resolve, 200));

    runtime.cancelJob(job.id);
    const children = [...runtime.jobs.values()].filter((item) => item.parentId === job.id);
    assert.ok(children.length > 0, '应该已经有子任务在跑');
    for (const child of children) {
      assert.notEqual(child.status, 'running', `child ${child.id} 应被一起取消`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dataDir, { recursive: true, force: true });
  }
});
