import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore } from '../lib/store.js';
import { extractText } from '../lib/extract.js';
import { buildZip } from './zipfixture.mjs';

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-kb-test-'));
  const store = new KnowledgeStore({ dataDir: dir });
  try {
    await fn(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('create, list and delete a library', async () => {
  await withStore(async (store) => {
    const kb = await store.createKb({ title: '毛泽东选集资料库', description: '哲学与政治' });
    assert.equal(kb.title, '毛泽东选集资料库');
    assert.equal(kb.docCount, 0);
    const list = await store.listKbs();
    assert.equal(list.length, 1);
    await store.updateKb(kb.id, { title: '毛选' });
    assert.equal((await store.listKbs())[0].title, '毛选');
    await store.deleteKb(kb.id);
    assert.equal((await store.listKbs()).length, 0);
  });
});

test('import a markdown file, convert, then search it', async () => {
  await withStore(async (store) => {
    const kb = await store.createKb({ title: '哲学库' });
    const { doc, extraction } = await store.addFile({
      kbId: kb.id,
      name: '实践论.md',
      mime: 'text/markdown',
      buffer: Buffer.from('# 实践论\n\n实践是检验真理的唯一标准。认识从实践始。', 'utf8'),
    });
    assert.equal(doc.kind, 'markdown');
    assert.equal(doc.status, 'imported');
    assert.ok(extraction.chars > 0);

    const pending = (await store.listDocs(kb.id)).filter((item) => item.status !== 'ready');
    assert.equal(pending.length, 1);

    await store.saveConverted({
      kbId: kb.id,
      docId: doc.id,
      title: '实践论',
      markdown: '# 实践论\n\n实践是检验真理的唯一标准。',
      summary: '认识论',
      tags: ['哲学'],
    });

    const ready = (await store.listDocs(kb.id))[0];
    assert.equal(ready.status, 'ready');
    assert.equal(ready.summary, '认识论');

    const result = await store.search({ kbId: kb.id, query: '检验真理', limit: 5 });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].docId, doc.id);
    assert.match(result.results[0].snippet, /检验/);
    assert.match(result.results[0].snippet, /真理/);

    const preview = await store.readPreview(kb.id, doc.id, { limit: 2000 });
    assert.match(preview.text, /实践是检验真理的唯一标准/);

    const catalog = await store.catalogOf(kb.id);
    assert.equal(catalog.ready, 1);
    assert.match(catalog.lines[0], /实践论/);
  });
});

test('paste plain text and bind it to a session', async () => {
  await withStore(async (store) => {
    const kb = await store.createKb({ title: '制度库' });
    const { doc } = await store.addText({ kbId: kb.id, title: '请假制度', text: '员工请假需提前三天申请。' });
    assert.equal(doc.status, 'imported');

    const bound = await store.bind('session-abc', kb.id);
    assert.equal(bound.kbId, kb.id);
    assert.equal((await store.bindingOf('session-abc')).title, '制度库');
    assert.equal(await store.bindingOf('session-missing'), null);

    // 未转化的文本不应进入检索结果
    const before = await store.search({ kbId: kb.id, query: '请假' });
    assert.equal(before.results.length, 0);

    await store.saveConverted({
      kbId: kb.id,
      docId: doc.id,
      title: '请假制度',
      markdown: '# 请假制度\n\n员工请假需提前三天申请。',
      summary: '请假流程',
      tags: ['人事'],
    });
    const after = await store.search({ kbId: kb.id, query: '请假' });
    assert.equal(after.results.length, 1);
  });
});

test('search supports CJK bigrams and ranks title matches', async () => {
  await withStore(async (store) => {
    const kb = await store.createKb({ title: '文学库' });
    for (const [title, body] of [
      ['矛盾论', '事物的矛盾法则，即对立统一的法则。'],
      ['实践论', '认识与实践的关系，实践是认识的来源。'],
    ]) {
      const { doc } = await store.addText({ kbId: kb.id, title, text: body });
      await store.saveConverted({ kbId: kb.id, docId: doc.id, title, markdown: `# ${title}\n\n${body}` });
    }
    const result = await store.search({ kbId: kb.id, query: '矛盾', limit: 5 });
    assert.equal(result.results[0].title, '矛盾论');
    const english = await store.search({ kbId: kb.id, query: '实践 来源', limit: 5 });
    assert.equal(english.results[0].title, '实践论');
  });
});

test('extract docx text from a zip container', async () => {
  const xml = '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>第一章</w:t></w:r></w:p><w:p><w:r><w:t>正文内容</w:t></w:r></w:p></w:body></w:document>';
  const zip = buildZip({ 'word/document.xml': xml, '[Content_Types].xml': '<Types/>' });
  const extracted = extractText(zip, 'docx');
  assert.match(extracted.text, /第一章/);
  assert.match(extracted.text, /正文内容/);
});

test('extract epub text in spine order', async () => {
  const opf = `<?xml version="1.0"?><package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>`;
  const zip = buildZip({
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    'OEBPS/content.opf': opf,
    'OEBPS/a.xhtml': '<html><body><p>第一篇</p></body></html>',
    'OEBPS/b.xhtml': '<html><body><p>第二篇</p></body></html>',
  });
  const extracted = extractText(zip, 'epub');
  assert.ok(extracted.text.indexOf('第二篇') < extracted.text.indexOf('第一篇'));
});

test('extract html strips tags and decodes entities', async () => {
  const extracted = extractText(Buffer.from('<html><body><h1>标题</h1><p>正文 &amp; 结论</p></body></html>', 'utf8'), 'html');
  assert.match(extracted.text, /标题/);
  assert.match(extracted.text, /正文 & 结论/);
});

test('delete a document removes its files', async () => {
  await withStore(async (store, dir) => {
    const kb = await store.createKb({ title: '临时库' });
    const { doc } = await store.addFile({ kbId: kb.id, name: 'note.txt', buffer: Buffer.from('一段足够长的普通文本，用来通过质量门禁检查。'.repeat(3), 'utf8') });
    await store.deleteDoc(kb.id, doc.id);
    assert.equal((await store.listDocs(kb.id)).length, 0);
    const stats = await store.stats();
    assert.equal(stats.docCount, 0);
  });
});
