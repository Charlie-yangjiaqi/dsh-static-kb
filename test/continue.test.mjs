import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../lib/runtime.js';
import { convertWithVision, extractDocumentImages } from '../lib/vision.js';
import { pdfPageCount } from '../lib/pdf.js';
import { writeConversionKey } from '../lib/settings.js';

function makeContext() {
  const records = new Map();
  const credentials = {
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
  const ctx = {
    get(name) {
      if (name === 'credentials') return credentials;
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
  return { ctx, records };
}

function mockChat(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const content = handler({ url: String(url), body });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return () => {
    globalThis.fetch = original;
  };
}

async function setup(dataDir) {
  const { ctx } = makeContext();
  const runtime = createRuntime({ ctx, config: { dataDir, chunkChars: 2000, maxChunks: 1 } });
  await runtime.ready();
  await runtime.settings.update({ baseURL: 'https://api.example.com/v1', model: 'cheap', visionModel: 'cheap-vl', vision: true, verify: false });
  await writeConversionKey(ctx, 'sk-test');
  return runtime;
}

test('text conversion records offset and continues from where it stopped', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-continue-'));
  const restore = mockChat(() => '<<<SUMMARY>>>\n摘要\n<<<TAGS>>>\n标签\n<<<CONTENT>>>\n# 长文\n\n这一段是转化正文。');
  try {
    const runtime = await setup(dataDir);
    const kb = await runtime.store.createKb({ title: '续读测试' });
    const longText = '这是用于测试继续转化的正文内容。'.repeat(400); // 约 6000 字符
    const { doc } = await runtime.store.addText({ kbId: kb.id, title: '长文', text: longText });

    const first = await runtime.convertAndWait(kb.id, doc.id);
    assert.equal(first.ok, true, JSON.stringify(first.job?.error));
    const afterFirst = (await runtime.store.listDocs(kb.id))[0];
    assert.equal(afterFirst.status, 'ready');
    assert.equal(afterFirst.partial, true, 'maxChunks=1 must leave the document partial');
    assert.ok(afterFirst.textOffset > 0 && afterFirst.textOffset < longText.length);

    const job = await runtime.startConversion(kb.id, doc.id, { continue: true });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const finished = runtime.getJob(job.job.id);
    assert.equal(finished.status, 'done', JSON.stringify(finished.error));

    const afterContinue = (await runtime.store.listDocs(kb.id))[0];
    assert.ok(afterContinue.textOffset > afterFirst.textOffset, 'continue must advance the offset');
    assert.equal(afterContinue.summary, '摘要', 'continue must keep the original summary');

    const markdown = await runtime.store.readMarkdown(kb.id, doc.id);
    const occurrences = markdown.text.split('这一段是转化正文。').length - 1;
    assert.ok(occurrences >= 2, 'continued content is appended, not replaced');
  } finally {
    restore();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('vision continuation appends without a new header and reports page count', async () => {
  const prompts = [];
  const settings = { baseURL: 'https://api.example.com/v1', model: 'm', visionModel: 'vl', temperature: 0.2 };
  const chat = async ({ system, messages }) => {
    prompts.push({ system, text: messages[0].content[0].text });
    return '新一页的正文内容。';
  };
  const images = [
    { mime: 'image/png', data: Buffer.from([0x89, 0x50]), page: 21 },
    { mime: 'image/png', data: Buffer.from([0x89, 0x50]), page: 22 },
  ];
  const result = await convertWithVision({ settings, apiKey: 'k', images, title: '扫描件', continuation: true, chat });
  assert.equal(result.mode, 'vision');
  assert.equal(result.pages, 2);
  assert.doesNotMatch(result.content, /^# /, 'continuation output must not start a new document title');
  assert.match(result.content, /新一页的正文内容/);
  assert.ok(prompts.every((entry) => entry.system.includes('后续页面')), 'continuation uses the continue prompt');
  assert.ok(prompts[0].text.includes('第 21 页'), 'prompt mentions the starting page');
});

test('pdfPageCount reports pages for a minimal PDF', () => {
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n4 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF',
    'latin1',
  );
  assert.equal(pdfPageCount(pdf), 2);
});

test('extractDocumentImages returns nothing for a non-first page when rasterizing is unavailable', async () => {
  const store = {
    async readRaw() {
      throw new Error('no raw');
    },
  };
  const images = await extractDocumentImages({ store, kbId: 'kb', doc: { kind: 'pdf', id: 'd' }, maxImages: 2, startPage: 5 });
  assert.deepEqual(images, []);
});
