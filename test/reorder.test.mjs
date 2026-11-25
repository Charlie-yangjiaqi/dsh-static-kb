import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore } from '../lib/store.js';

const onePagePdf = () =>
  Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n%%EOF',
    'latin1',
  );

async function seed() {
  const dir = await mkdtemp(join(tmpdir(), 'kb-reorder-'));
  const store = new KnowledgeStore({ dataDir: dir });
  await store.ensureLoaded();
  const kb = await store.createKb({ title: '国标' });
  const ids = [];
  for (const title of ['弧焊设备 第1部分：焊接电源', '弧焊设备 第2部分：液体冷却系统', '弧焊设备 第10部分：电磁兼容性']) {
    const { doc } = await store.addFile({ kbId: kb.id, name: `${title}.pdf`, mime: 'application/pdf', buffer: onePagePdf() });
    await store.saveConverted({ kbId: kb.id, docId: doc.id, title, markdown: `# ${title}\n\n正文。` });
    ids.push(doc.id);
  }
  return { store, kb, ids, dir };
}

test('a new library defaults to automatic ordering', async () => {
  const { store, kb, dir } = await seed();
  try {
    assert.equal((await store.getKb(kb.id)).sortMode, 'auto');
    const docs = await store.listDocs(kb.id);
    assert.deepEqual(docs.map((doc) => doc.order), [null, null, null]);
    await rm(dir, { recursive: true, force: true });
  } finally {
    /* 清理在用例内部完成 */
  }
});

test('reorderDocs stores the given order and switches the library to manual', async () => {
  const { store, kb, ids, dir } = await seed();
  try {
    const reordered = await store.reorderDocs(kb.id, [ids[2], ids[0], ids[1]]);
    assert.deepEqual(reordered.map((doc) => doc.id), [ids[2], ids[0], ids[1]]);
    assert.deepEqual(reordered.map((doc) => doc.order), [0, 1, 2]);
    assert.equal((await store.getKb(kb.id)).sortMode, 'manual');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('manual order survives a reload', async () => {
  const { store, kb, ids, dir } = await seed();
  try {
    await store.reorderDocs(kb.id, [ids[1], ids[2], ids[0]]);
    const reopened = new KnowledgeStore({ dataDir: dir });
    await reopened.ensureLoaded();
    const docs = await reopened.listDocs(kb.id);
    assert.deepEqual(docs.map((doc) => doc.id), [ids[1], ids[2], ids[0]]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('reorderDocs rejects unknown ids and ignores duplicates', async () => {
  const { store, kb, ids, dir } = await seed();
  try {
    await assert.rejects(() => store.reorderDocs(kb.id, ['doc-missing']), (error) => /文档不存在/.test(String(error.message)));
    const docs = await store.reorderDocs(kb.id, [ids[0], ids[0], ids[1], ids[2]]);
    assert.deepEqual(docs.map((doc) => doc.id), [ids[0], ids[1], ids[2]]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('documents not listed in the reorder are appended after the listed ones', async () => {
  const { store, kb, ids, dir } = await seed();
  try {
    const docs = await store.reorderDocs(kb.id, [ids[1]]);
    assert.equal(docs[0].id, ids[1]);
    assert.equal(docs.length, 3);
    assert.deepEqual(docs.map((doc) => doc.order), [0, 1, 2]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('resetDocOrder clears manual order and restores title sorting', async () => {
  const { store, kb, ids, dir } = await seed();
  try {
    await store.reorderDocs(kb.id, [ids[2], ids[1], ids[0]]);
    const restored = await store.resetDocOrder(kb.id);
    assert.equal((await store.getKb(kb.id)).sortMode, 'auto');
    assert.deepEqual(restored.map((doc) => doc.id), [ids[0], ids[1], ids[2]]);
    assert.deepEqual(restored.map((doc) => doc.order), [null, null, null]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
