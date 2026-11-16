import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore, convertedBaseName } from '../lib/store.js';

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-kb-name-'));
  const store = new KnowledgeStore({ dataDir: dir });
  try {
    await fn(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('convertedBaseName puts the LLM title first and the source file name in parentheses', () => {
  assert.equal(convertedBaseName('数字IGBT控制弧焊电源使用说明书', 'YD-350_manual.pdf'), '数字IGBT控制弧焊电源使用说明书（YD-350_manual）');
  assert.equal(convertedBaseName('实践论', '实践论.md'), '实践论');
  assert.equal(convertedBaseName('粘贴整理的笔记', '粘贴文本'), '粘贴整理的笔记');
  assert.equal(convertedBaseName('', 'x.pdf'), '未命名文档（x）');
});

test('convertedBaseName strips characters Windows rejects', () => {
  const name = convertedBaseName('A/B:C*D?E"F<G>H|I', 'src.pdf');
  assert.doesNotMatch(name, /[<>:"/\\|?*]/);
  assert.match(name, /A／B：C＊D？E＂F＜G＞H｜I（src）/);
});

test('convertedBaseName does not duplicate an existing parenthetical', () => {
  assert.equal(convertedBaseName('手册（v1）', 'v1.pdf'), '手册（v1）');
});

test('saveConverted names the markdown file after the title and original file', async () => {
  await withStore(async (store) => {
    const kb = await store.createKb({ title: '焊机产品说明书' });
    const { doc } = await store.addFile({
      kbId: kb.id,
      name: 'YD-350_manual.pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n%%EOF', 'latin1'),
    });
    await store.saveConverted({
      kbId: kb.id,
      docId: doc.id,
      title: '数字IGBT控制弧焊电源使用说明书',
      markdown: '# 数字IGBT控制弧焊电源使用说明书\n\n正文。',
      summary: '摘要',
    });
    const listed = (await store.listDocs(kb.id))[0];
    assert.equal(listed.title, '数字IGBT控制弧焊电源使用说明书');
    const files = await readdir(join(store.dataDir, kb.id, 'docs'));
    assert.deepEqual(files, ['数字IGBT控制弧焊电源使用说明书（YD-350_manual）.md']);
    const preview = await store.readPreview(kb.id, doc.id, { limit: 1000 });
    assert.match(preview.text, /正文/);
  });
});

test('re-converting renames the file and removes the old one', async () => {
  await withStore(async (store) => {
    const kb = await store.createKb({ title: '改名测试' });
    const { doc } = await store.addFile({ kbId: kb.id, name: 'old-name.txt', buffer: Buffer.from('一段用于转化的普通文本内容。'.repeat(4), 'utf8') });
    await store.saveConverted({ kbId: kb.id, docId: doc.id, title: '第一版标题', markdown: '# 第一版标题\n\n内容一。' });
    await store.saveConverted({ kbId: kb.id, docId: doc.id, title: '第二版标题', markdown: '# 第二版标题\n\n内容二。' });
    const files = await readdir(join(store.dataDir, kb.id, 'docs'));
    assert.deepEqual(files, ['第二版标题（old-name）.md']);
  });
});

test('two documents never share one markdown file name', async () => {
  await withStore(async (store) => {
    const kb = await store.createKb({ title: '重名测试' });
    const first = await store.addFile({ kbId: kb.id, name: 'same.txt', buffer: Buffer.from('第一份文档的文本内容，够长。'.repeat(4), 'utf8') });
    const second = await store.addFile({ kbId: kb.id, name: 'same.txt', buffer: Buffer.from('第二份文档的文本内容，也够长。'.repeat(4), 'utf8') });
    await store.saveConverted({ kbId: kb.id, docId: first.doc.id, title: '同名标题', markdown: '# 同名标题\n\n甲。' });
    await store.saveConverted({ kbId: kb.id, docId: second.doc.id, title: '同名标题', markdown: '# 同名标题\n\n乙。' });
    const files = (await readdir(join(store.dataDir, kb.id, 'docs'))).sort();
    assert.equal(files.length, 2);
    assert.ok(files.includes('同名标题（same）.md'), files.join(','));
    assert.ok(files.some((name) => name.startsWith('同名标题（same） (2)')), files.join(','));
  });
});

test('legacy hash-named markdown files are migrated on listing', async () => {
  await withStore(async (store, dir) => {
    const kb = await store.createKb({ title: '迁移测试' });
    const { doc } = await store.addFile({ kbId: kb.id, name: 'migrate.txt', buffer: Buffer.from('迁移用文本，长度足够通过校验。'.repeat(4), 'utf8') });
    // 模拟旧版本留下的文件与元数据
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, kb.id, 'docs'), { recursive: true });
    await writeFile(join(dir, kb.id, 'docs', `${doc.id}.md`), '# 旧标题\n\n旧内容。', 'utf8');
    const kbRecord = await store.getKb(kb.id);
    const target = kbRecord.docs.find((item) => item.id === doc.id);
    target.mdPath = `docs/${doc.id}.md`;
    target.title = '旧标题';
    target.status = 'ready';
    await store.flush();

    await store.listDocs(kb.id);
    const files = await readdir(join(dir, kb.id, 'docs'));
    assert.deepEqual(files, ['旧标题（migrate）.md']);
    const listed = (await store.listDocs(kb.id))[0];
    const preview = await store.readPreview(kb.id, doc.id, { limit: 500 });
    assert.match(preview.text, /旧内容/);
    assert.equal(listed.id, doc.id);
  });
});
