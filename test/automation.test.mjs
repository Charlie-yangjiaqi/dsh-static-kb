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

function pdfWithObjects(objects) {
  let out = '%PDF-1.4\n';
  for (const [num, body] of Object.entries(objects)) out += `${num} 0 obj\n${body}\nendobj\n`;
  return Buffer.from(`${out}%%EOF`, 'latin1');
}

const onePagePdf = () =>
  pdfWithObjects({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
  });

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-auto-'));
  const ctx = makeContext();
  const runtime = createRuntime({ ctx, config: { dataDir } });
  await runtime.ready();
  const kb = await runtime.store.createKb({ title: 'auto' });
  return { runtime, kb, ctx, dataDir };
}

test('automation defaults are on and manual buttons are off', async () => {
  const { runtime, dataDir } = await setup();
  try {
    const conversion = await runtime.settings.get();
    assert.equal(conversion.autoVisionFallback, true);
    assert.equal(conversion.autoRepair, true);
    assert.equal(conversion.repairAttempts, 2);
    assert.equal(conversion.showManualActions, false);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('automation switches persist through settings.update', async () => {
  const { runtime, dataDir } = await setup();
  try {
    const updated = await runtime.settings.update({
      autoVisionFallback: false,
      autoRepair: false,
      repairAttempts: 4,
      showManualActions: true,
    });
    assert.equal(updated.autoVisionFallback, false);
    assert.equal(updated.autoRepair, false);
    assert.equal(updated.repairAttempts, 4);
    assert.equal(updated.showManualActions, true);
    // 越界值被夹住
    const clamped = await runtime.settings.update({ repairAttempts: 99 });
    assert.equal(clamped.repairAttempts, 5);
    const zero = await runtime.settings.update({ repairAttempts: 0 });
    assert.equal(zero.repairAttempts, 0);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('a PDF with no extractable text goes to vision automatically instead of staying pending', async () => {
  const { runtime, kb, ctx, dataDir } = await setup();
  try {
    // 指向必然连不通的地址：这条用例只验证「自动走视觉并给出明确失败」，不依赖真实模型。
    await runtime.settings.update({ baseURL: 'http://127.0.0.1:9/v1', model: 'm', visionModel: 'vl', concurrency: 1, verify: false });
    await writeConversionKey(ctx, 'sk');
    const { doc } = await runtime.store.addFile({ kbId: kb.id, name: 'scan.pdf', mime: 'application/pdf', buffer: onePagePdf() });
    assert.equal(doc.hasText, false, '这份 PDF 没有文字层');

    const { job } = await runtime.startConversion(kb.id, doc.id);
    let finished = runtime.getJob(job.id);
    for (let attempt = 0; attempt < 100 && finished.status === 'running'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      finished = runtime.getJob(job.id);
    }
    // 关键点：不再静默停在「待转化」——任务结束并带有可读的失败原因。
    assert.equal(finished.status, 'error');
    assert.equal(typeof finished.error.message, 'string');
    assert.ok(finished.error.message.length > 0);
    assert.ok(
      ['vision-empty', 'vision-unavailable'].includes(finished.error.code) || finished.error.code === 'conversion-failed' || finished.error.code === 'vision-failed',
      `unexpected code: ${finished.error.code}`,
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('auto vision fallback can be switched off to require explicit action', async () => {
  const { runtime, kb, ctx, dataDir } = await setup();
  try {
    await runtime.settings.update({
      baseURL: 'https://api.example.com/v1',
      model: 'm',
      visionModel: 'vl',
      concurrency: 1,
      verify: false,
      autoVisionFallback: false,
      vision: false,
    });
    await writeConversionKey(ctx, 'sk');
    const { doc } = await runtime.store.addFile({ kbId: kb.id, name: 'scan.pdf', mime: 'application/pdf', buffer: onePagePdf() });
    const { job } = await runtime.startConversion(kb.id, doc.id);
    let finished = runtime.getJob(job.id);
    for (let attempt = 0; attempt < 60 && finished.status === 'running'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      finished = runtime.getJob(job.id);
    }
    assert.equal(finished.status, 'error');
    assert.equal(finished.error.code, 'vision-unavailable');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
