import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore } from '../lib/store.js';
import { compareNatural } from '../lib/util.js';

test('compareNatural orders ordinals numerically, not lexically', () => {
  const titles = [
    '弧焊设备 第10部分：电磁兼容性',
    '弧焊设备 第2部分：液体冷却系统',
    '弧焊设备 第1部分：焊接电源',
    '弧焊设备 第14部分：校准',
    '弧焊设备 第3部分：引弧和稳弧装置',
  ];
  assert.deepEqual([...titles].sort(compareNatural), [
    '弧焊设备 第1部分：焊接电源',
    '弧焊设备 第2部分：液体冷却系统',
    '弧焊设备 第3部分：引弧和稳弧装置',
    '弧焊设备 第10部分：电磁兼容性',
    '弧焊设备 第14部分：校准',
  ]);
});

test('compareNatural converts Chinese numerals', () => {
  const titles = ['弧焊设备 第十部分', '弧焊设备 第二部分', '弧焊设备 第一部分'];
  assert.deepEqual([...titles].sort(compareNatural), [
    '弧焊设备 第一部分',
    '弧焊设备 第二部分',
    '弧焊设备 第十部分',
  ]);
});

test('compareNatural handles titles without ordinals', () => {
  const titles = ['米勒 Dynasty 210 用户手册', '佳士 TIG 400P 操作手册', '福尼斯 iWave 300i 操作说明书'];
  const sorted = [...titles].sort(compareNatural);
  assert.equal(sorted.length, 3);
  assert.deepEqual(sorted, titles.slice().sort(compareNatural));
});

test('compareNatural handles mixed numbering widths and plain numbers', () => {
  assert.ok(compareNatural('第2部分', '第10部分') < 0);
  assert.ok(compareNatural('Chapter 2', 'Chapter 10') < 0);
  assert.equal(compareNatural('同名', '同名'), 0);
});

test('listDocs returns documents in natural title order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-sort-'));
  const store = new KnowledgeStore({ dataDir: dir });
  await store.ensureLoaded();
  const kb = await store.createKb({ title: '国标' });
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n%%EOF', 'latin1');
  // 故意按乱序导入
  for (const title of ['弧焊设备 第10部分：电磁兼容性', '弧焊设备 第2部分：液体冷却系统', '弧焊设备 第1部分：焊接电源']) {
    const { doc } = await store.addFile({ kbId: kb.id, name: `${title}.pdf`, mime: 'application/pdf', buffer: pdf });
    await store.saveConverted({ kbId: kb.id, docId: doc.id, title, markdown: `# ${title}\n\n正文。` });
  }
  const docs = await store.listDocs(kb.id);
  assert.deepEqual(docs.map((doc) => doc.title), [
    '弧焊设备 第1部分：焊接电源',
    '弧焊设备 第2部分：液体冷却系统',
    '弧焊设备 第10部分：电磁兼容性',
  ]);
  await rm(dir, { recursive: true, force: true });
});
