import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore } from '../lib/store.js';
import { alignTitleWithLibrary, isGenericTitle, resolveDocTitle, tidyTitle } from '../lib/util.js';

test('cover-line titles from standards are recognised as generic', () => {
  assert.equal(isGenericTitle('中华人民共和国国家标准'), true);
  assert.equal(isGenericTitle('中华人民共和国国家标准 GB/T 15579.6-2018'), true);
  assert.equal(isGenericTitle('使用说明书'), true);
  assert.equal(isGenericTitle('目录'), true);
  assert.equal(isGenericTitle(''), true);
});

test('real document titles are kept', () => {
  assert.equal(isGenericTitle('弧焊设备 第6部分：限制负载的设备'), false);
  assert.equal(isGenericTitle('Panasonic 取扱説明書 交直両用 TIG 溶接機'), false);
  assert.equal(isGenericTitle('Miller Dynasty 210 Owner’s Manual'), false);
});

test('a generic model title falls back to the file name', () => {
  const title = resolveDocTitle('中华人民共和国国家标准', '旧标题', 'GB_T 15579.6-2018 弧焊设备  第6部分：限制负载的设备.pdf');
  assert.equal(title, 'GB_T 15579.6-2018 弧焊设备  第6部分：限制负载的设备');
});

test('a specific model title wins over the file name', () => {
  const title = resolveDocTitle('弧焊设备 第6部分：限制负载的设备', '旧标题', 'GB_T 15579.6-2018 弧焊设备  第6部分：限制负载的设备.pdf');
  assert.equal(title, '弧焊设备 第6部分：限制负载的设备');
});

test('when model title and file name are both generic, the model title is kept', () => {
  const title = resolveDocTitle('中华人民共和国国家标准', '旧标题', '说明书.pdf');
  assert.equal(title, '中华人民共和国国家标准');
});

test('a missing model title falls back to the file name', () => {
  const title = resolveDocTitle('', '旧标题', 'GB∕T 15579.14-2021 弧焊设备 第14部分：校准、确认和一致性试验.pdf');
  assert.equal(title, 'GB∕T 15579.14-2021 弧焊设备 第14部分：校准、确认和一致性试验');
});

test('the .pdf extension is stripped from the fallback title', () => {
  const title = resolveDocTitle('', '旧标题', 'welding manual.PDF');
  assert.equal(title, 'welding manual');
});

test('tidyTitle removes standard numbers, versions and dates', () => {
  assert.equal(tidyTitle('GB_T 15579.6-2018 弧焊设备 第6部分：限制负载的设备'), '弧焊设备 第6部分：限制负载的设备');
  assert.equal(tidyTitle('弧焊设备 第 1 部分：焊接电源 (GB/T 15579.1-2024)'), '弧焊设备 第 1 部分：焊接电源');
  assert.equal(tidyTitle('Miller Dynasty 210 Rev.2 第 3 版'), 'Miller Dynasty 210');
  assert.equal(tidyTitle('  《弧焊设备》  '), '《弧焊设备》');
});

test('tidyTitle keeps short titles intact and trims long ones', () => {
  assert.equal(tidyTitle('弧焊设备 第 6 部分：限制负载的设备'), '弧焊设备 第 6 部分：限制负载的设备');
  const long = tidyTitle('弧焊设备 第 1 部分：焊接电源 安全要求 完整技术规范与试验方法大全集以及补充说明');
  assert.ok(long.length <= 60, long);
});

test('library alignment unifies the ordinal style with siblings', () => {
  const library = ['弧焊设备 第 1 部分：焊接电源', '弧焊设备 第 2 部分：液体冷却系统'];
  assert.equal(alignTitleWithLibrary('弧焊设备 第6部分：限制负载的设备', library), '弧焊设备 第 6 部分：限制负载的设备');
  assert.equal(alignTitleWithLibrary('弧焊设备 第13部分 焊接夹钳', library), '弧焊设备 第 13 部分：焊接夹钳');
});

test('library alignment leaves unrelated titles alone', () => {
  const library = ['弧焊设备 第 1 部分：焊接电源', 'Miller Dynasty 210 Owner Manual'];
  assert.equal(alignTitleWithLibrary('Panasonic 取扱説明書', library), 'Panasonic 取扱説明書');
  assert.equal(alignTitleWithLibrary('弧焊设备 第6部分：限制负载的设备', []), '弧焊设备 第6部分：限制负载的设备');
});

test('saveConverted tidies and aligns the title against the library', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'title-align-'));
  const store = new KnowledgeStore({ dataDir: dir });
  await store.ensureLoaded();
  const kb = await store.createKb({ title: '国标' });
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n%%EOF', 'latin1');
  for (const title of ['弧焊设备 第 1 部分：焊接电源', '弧焊设备 第 2 部分：液体冷却系统']) {
    const { doc } = await store.addFile({ kbId: kb.id, name: `${title}.pdf`, mime: 'application/pdf', buffer: pdf });
    await store.saveConverted({ kbId: kb.id, docId: doc.id, title, markdown: `# ${title}\n\n正文。` });
  }
  const { doc } = await store.addFile({ kbId: kb.id, name: 'GB_T 15579.6-2018 弧焊设备  第6部分：限制负载的设备.pdf', mime: 'application/pdf', buffer: pdf });
  const saved = await store.saveConverted({ kbId: kb.id, docId: doc.id, title: 'GB_T 15579.6-2018 弧焊设备 第6部分：限制负载的设备', markdown: '# 弧焊设备 第 6 部分：限制负载的设备\n\n正文。' });
  assert.equal(saved.title, '弧焊设备 第 6 部分：限制负载的设备');
  await rm(dir, { recursive: true, force: true });
});

test('tidyTitle never cuts inside brackets or book-title marks', () => {
  const long = "Miller Dynasty 210 / Maxstar 210（Auto-Line 120–480 V，CE）Owner's Manual 整理稿版本";
  const out = tidyTitle(long);
  for (const pair of [['（', '）'], ['(', ')'], ['《', '》']]) {
    assert.equal(out.split(pair[0]).length, out.split(pair[1]).length, out);
  }
  assert.ok(out.length <= 80, out);
});

test('tidyTitle keeps slashes in model names instead of cutting at them', () => {
  assert.equal(tidyTitle('iW 300i / 400i / 500i A 焊接电源操作说明书（整理稿）'), 'iW 300i / 400i / 500i A 焊接电源操作说明书（整理稿）');
  assert.equal(tidyTitle('《离线之后》完整长篇创作大纲'), '《离线之后》完整长篇创作大纲');
});

test('tidyTitle strips every GB/T spelling', () => {
  for (const raw of ['GB_T 15579.6-2018 弧焊设备 第6部分：限制负载的设备', 'GB∕T 15579.14-2021 弧焊设备 第14部分：校准', 'GB T 15579.13-2016 弧焊设备 第13部分 焊接夹钳']) {
    const out = tidyTitle(raw);
    assert.ok(!/GB/i.test(out), out);
    assert.ok(out.startsWith('弧焊设备'), out);
  }
});
