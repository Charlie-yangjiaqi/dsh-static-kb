import assert from 'node:assert/strict';
import test from 'node:test';
import { mapLimit } from '../lib/util.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../lib/runtime.js';
import { writeConversionKey } from '../lib/settings.js';

test('mapLimit keeps input order and never exceeds the limit', async () => {
  let active = 0;
  let peak = 0;
  const items = Array.from({ length: 9 }, (_, index) => index);
  const results = await mapLimit(items, 3, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5 + (item % 3) * 5));
    active -= 1;
    return item * 10;
  });
  assert.deepEqual(results, items.map((item) => item * 10));
  assert.ok(peak <= 3, `peak concurrency ${peak}`);
  assert.ok(peak >= 2, 'work should actually run in parallel');
});

test('mapLimit reports completed count and propagates the first failure', async () => {
  const seen = [];
  await assert.rejects(
    () =>
      mapLimit(
        [1, 2, 3, 4],
        2,
        async (item) => {
          if (item === 3) throw new Error('boom');
          return item;
        },
        (_index, _result, _error, done, total) => seen.push(`${done}/${total}`),
      ),
    /boom/,
  );
  assert.ok(seen.length > 0);
  assert.ok(seen.every((entry) => entry.endsWith('/4')));
});

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

test('chunks are converted in parallel yet assembled in document order', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-parallel-'));
  const originalFetch = globalThis.fetch;
  const order = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const prompt = body.messages.at(-1).content.map((part) => part.text ?? '').join('');
    const match = /第 (\d+) 段/.exec(prompt);
    const segment = match === null ? 1 : Number(match[1]);
    order.push(segment);
    // 后面的段先返回，用来验证拼接顺序不受完成顺序影响
    await new Promise((resolve) => setTimeout(resolve, 40 - segment * 5));
    const content = segment === 1
      ? '<<<SUMMARY>>>\n摘要\n<<<TAGS>>>\n标签\n<<<CONTENT>>>\n# 标题\n\n第一段。'
      : `第${segment}段。`;
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  try {
    const ctx = makeContext();
    const runtime = createRuntime({ ctx, config: { dataDir, chunkChars: 2000, maxChunks: 4, concurrency: 3 } });
    await runtime.ready();
    await runtime.settings.update({ baseURL: 'https://api.example.com/v1', model: 'm', concurrency: 3, verify: false, vision: false });
    await writeConversionKey(ctx, 'sk');
    const kb = await runtime.store.createKb({ title: '并行测试' });
    const text = '这是一段用于并行转化的正文内容。'.repeat(700);
    const { doc } = await runtime.store.addText({ kbId: kb.id, title: '并行', text });

    const outcome = await runtime.convertAndWait(kb.id, doc.id);
    assert.equal(outcome.ok, true, JSON.stringify(outcome.job?.error));
    const converted = await runtime.store.readMarkdown(kb.id, doc.id);
    const position1 = converted.text.indexOf('第一段。');
    const position2 = converted.text.indexOf('第2段。');
    assert.ok(position1 >= 0 && position2 > position1, 'segments must stay in document order');
    assert.ok(order.length >= 2, 'more than one chunk should have been sent');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('job.percent grows from conversion progress', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-percent-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return new Response(JSON.stringify({ choices: [{ message: { content: '<<<SUMMARY>>>\n摘要\n<<<TAGS>>>\n标签\n<<<CONTENT>>>\n# 标题\n\n正文。' } }] }), { status: 200 });
  };
  try {
    const ctx = makeContext();
    const runtime = createRuntime({ ctx, config: { dataDir, chunkChars: 2000, maxChunks: 4, concurrency: 1 } });
    await runtime.ready();
    await runtime.settings.update({ baseURL: 'https://api.example.com/v1', model: 'm', concurrency: 1, verify: false, vision: false });
    await writeConversionKey(ctx, 'sk');
    const kb = await runtime.store.createKb({ title: '进度测试' });
    const { doc } = await runtime.store.addText({ kbId: kb.id, title: '进度', text: '进度测试正文内容。'.repeat(600) });

    const { job } = await runtime.startConversion(kb.id, doc.id);
    assert.equal(job.status, 'running');
    assert.equal(job.percent, 0);
    const seen = new Set();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const current = runtime.getJob(job.id);
      seen.add(current.percent);
      if (current.status !== 'running') {
        assert.equal(current.percent, 100);
        break;
      }
    }
    assert.ok(seen.size > 1, `percent should change over time, saw ${[...seen].join(',')}`);
    for (const value of seen) assert.ok(value >= 0 && value <= 100);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('full conversion keeps going until no pages remain', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-full-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return new Response(JSON.stringify({ choices: [{ message: { content: '<<<SUMMARY>>>\n摘要\n<<<TAGS>>>\n标签\n<<<CONTENT>>>\n# 标题\n\n正文。' } }] }), { status: 200 });
  };
  try {
    const ctx = makeContext();
    const runtime = createRuntime({ ctx, config: { dataDir, chunkChars: 2000, maxChunks: 1, concurrency: 2 } });
    await runtime.ready();
    await runtime.settings.update({ baseURL: 'https://api.example.com/v1', model: 'm', concurrency: 2, verify: false, vision: false });
    await writeConversionKey(ctx, 'sk');
    const kb = await runtime.store.createKb({ title: '全量测试' });
    const text = '全量转化测试正文。'.repeat(2500); // 9000 字符 → 多次分块
    const { doc } = await runtime.store.addText({ kbId: kb.id, title: '全量', text });

    // 先做一次常规转化，maxChunks=1 会留下 partial
    const first = await runtime.convertAndWait(kb.id, doc.id);
    assert.equal(first.ok, true, JSON.stringify(first.job?.error));
    const afterFirst = (await runtime.store.listDocs(kb.id))[0];
    assert.equal(afterFirst.partial, true);

    // 全量转化：一次跑完剩余所有分块
    const { job } = await runtime.startFullConversion(kb.id, doc.id);
    assert.equal(job.status, 'running');
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const current = runtime.getJob(job.id);
      if (current.status !== 'running') {
        assert.equal(current.status, 'done', JSON.stringify(current.error));
        assert.equal(current.percent, 100);
        break;
      }
    }
    const afterFull = (await runtime.store.listDocs(kb.id))[0];
    assert.equal(afterFull.partial, false, '全量转化必须把剩余内容全部处理完');
    assert.ok(afterFull.textOffset >= text.length - 5);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('library-wide full conversion skips finished documents and reports progress', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-kbfull-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
    return new Response(JSON.stringify({ choices: [{ message: { content: '<<<SUMMARY>>>\n摘要\n<<<TAGS>>>\n标签\n<<<CONTENT>>>\n# 标题\n\n正文。' } }] }), { status: 200 });
  };
  try {
    const ctx = makeContext();
    const runtime = createRuntime({ ctx, config: { dataDir, chunkChars: 2000, maxChunks: 1, concurrency: 2 } });
    await runtime.ready();
    await runtime.settings.update({ baseURL: 'https://api.example.com/v1', model: 'm', concurrency: 2, verify: false, vision: false });
    await writeConversionKey(ctx, 'sk');
    const kb = await runtime.store.createKb({ title: '库全量' });
    const long = '库全量测试正文。'.repeat(1200);
    const { doc: partialDoc } = await runtime.store.addText({ kbId: kb.id, title: '部分', text: long });
    await runtime.convertAndWait(kb.id, partialDoc.id);
    const before = (await runtime.store.listDocs(kb.id))[0];
    assert.equal(before.partial, true);

    const { job } = await runtime.startFullLibrary(kb.id);
    assert.equal(job.status, 'running');
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const current = runtime.getJob(job.id);
      if (current.status !== 'running') {
        assert.equal(current.status, 'done', JSON.stringify(current.error));
        break;
      }
    }
    const after = (await runtime.store.listDocs(kb.id))[0];
    assert.equal(after.partial, false);

    // 再点一次：没有需要转化的文档，直接跳过
    const again = await runtime.startFullLibrary(kb.id);
    assert.equal(again.skipped, true);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dataDir, { recursive: true, force: true });
  }
});
