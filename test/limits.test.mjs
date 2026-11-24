import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore } from '../lib/store.js';

const MB = 1024 * 1024;

function minimalPdf(targetBytes) {
  let out = '%PDF-1.4\n';
  out += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  out += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  out += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n';
  // Pad with comment lines: PDF allows arbitrary comments between objects.
  const padLine = `% ${'x'.repeat(120)}\n`;
  const filler = Math.max(0, targetBytes - Buffer.byteLength(out) - 64);
  out += padLine.repeat(Math.floor(filler / padLine.length));
  out += '%%EOF';
  return Buffer.from(out, 'latin1');
}

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-kb-limits-'));
  const store = new KnowledgeStore({ dataDir });
  await store.ensureLoaded();
  const kb = await store.createKb({ title: 'limits' });
  return { store, kb, dataDir };
}

test('PDF uploads accept more than 32 MB and stay under 50 MB', async () => {
  const { store, kb, dataDir } = await setup();
  try {
    const pdf = minimalPdf(33 * MB);
    assert.ok(pdf.length > 32 * MB && pdf.length < 50 * MB);
    const { doc } = await store.addFile({ kbId: kb.id, name: 'big.pdf', mime: 'application/pdf', buffer: pdf });
    assert.equal(doc.kind, 'pdf');
    assert.ok(doc.bytes > 32 * MB);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('PDF uploads over 50 MB are rejected', async () => {
  const { store, kb, dataDir } = await setup();
  try {
    const pdf = minimalPdf(51 * MB);
    await assert.rejects(
      () => store.addFile({ kbId: kb.id, name: 'huge.pdf', mime: 'application/pdf', buffer: pdf }),
      (error) => /50 MB/.test(String(error.message)),
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('non-PDF uploads keep the 32 MB limit', async () => {
  const { store, kb, dataDir } = await setup();
  try {
    const big = Buffer.alloc(33 * MB, 0x41);
    await assert.rejects(
      () => store.addFile({ kbId: kb.id, name: 'big.txt', mime: 'text/plain', buffer: big }),
      (error) => /32 MB/.test(String(error.message)),
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
