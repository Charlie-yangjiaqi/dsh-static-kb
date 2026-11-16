import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../lib/runtime.js';
import { convertWithVision } from '../lib/vision.js';

function makeContext() {
  return {
    get(name) {
      if (name === 'credentials') {
        return {
          async readRecord() {
            return undefined;
          },
          async modifyRecord() {
            return undefined;
          },
          async deleteRecord() {},
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

function pdfWithObjects(objects) {
  let out = '%PDF-1.4\n';
  for (const [num, body] of Object.entries(objects)) out += `${num} 0 obj\n${body}\nendobj\n`;
  return Buffer.from(`${out}%%EOF`, 'latin1');
}

const onePagePdf = () =>
  pdfWithObjects({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>',
    4: `<< /Length 16 >>\nstream\nBT ET\n\n\n\n\nendstream`,
  });

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-repair-'));
  const runtime = createRuntime({ ctx: makeContext(), config: { dataDir } });
  await runtime.ready();
  const kb = await runtime.store.createKb({ title: '修复测试' });
  return { runtime, kb, dataDir };
}

test('forcing vision without a configured vision endpoint fails with a clear code', async () => {
  const { runtime, kb, dataDir } = await setup();
  try {
    const { doc } = await runtime.store.addFile({ kbId: kb.id, name: 'scan.pdf', buffer: onePagePdf() });
    const { job } = await runtime.startConversion(kb.id, doc.id, { forceVision: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const finished = runtime.getJob(job.id);
    assert.equal(finished.status, 'error');
    assert.equal(finished.error.code, 'vision-unavailable');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('forcing vision on a text document is rejected', async () => {
  const { runtime, kb, dataDir } = await setup();
  try {
    const { doc } = await runtime.store.addText({ kbId: kb.id, title: '文本', text: '一段普通文本，用来测试视觉提取的限制。' });
    const { job } = await runtime.startConversion(kb.id, doc.id, { forceVision: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const finished = runtime.getJob(job.id);
    assert.equal(finished.status, 'error');
    assert.equal(finished.error.code, 'vision-unsupported');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('repair requires a vision endpoint and a PDF/image document', async () => {
  const { runtime, kb, dataDir } = await setup();
  try {
    const { doc: textDoc } = await runtime.store.addText({ kbId: kb.id, title: '文本', text: '普通文本内容，长度足够。' });
    await assert.rejects(() => runtime.startRepair(kb.id, textDoc.id), (error) => error.code === 'vision-unsupported');

    const { doc: pdfDoc } = await runtime.store.addFile({ kbId: kb.id, name: 'scan.pdf', buffer: onePagePdf() });
    const { doc: rawPdf } = await runtime.store.getDoc(kb.id, pdfDoc.id);
    rawPdf.conversionMode = 'vision';
    await runtime.store.flush();
    await assert.rejects(() => runtime.startRepair(kb.id, pdfDoc.id), (error) => error.code === 'vision-unavailable');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('repair notes are forwarded to the vision prompt', async () => {
  const prompts = [];
  const settings = { baseURL: 'https://api.example.com/v1', model: 'm', visionModel: 'vl', temperature: 0.2 };
  const chat = async ({ messages }) => {
    prompts.push(messages[0].content[0].text);
    return '<<<SUMMARY>>>\n摘要\n<<<TAGS>>>\n标签\n<<<CONTENT>>>\n# 标题\n\n正文。';
  };
  await convertWithVision({
    settings,
    apiKey: 'k',
    images: [{ mime: 'image/png', data: Buffer.from([0x89, 0x50]), page: 1 }],
    title: '测试',
    notes: '第 2 页型号数字可能看错',
    chat,
  });
  assert.match(prompts[0], /复核发现的问题/);
  assert.match(prompts[0], /型号数字可能看错/);
});

test('repair refuses a text-converted PDF (use rebuild with vision instead)', async () => {
  const { runtime, kb, dataDir } = await setup();
  try {
    const { doc } = await runtime.store.addFile({ kbId: kb.id, name: 'manual.pdf', buffer: onePagePdf() });
    const { doc: raw } = await runtime.store.getDoc(kb.id, doc.id);
    raw.conversionMode = 'text';
    raw.mdPath = 'docs/x.md';
    await runtime.store.flush();
    await assert.rejects(() => runtime.startRepair(kb.id, doc.id), (error) => error.code === 'vision-not-applicable');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
