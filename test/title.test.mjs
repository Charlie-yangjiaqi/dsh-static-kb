import assert from 'node:assert/strict';
import test from 'node:test';
import { isGenericTitle, resolveDocTitle } from '../lib/util.js';

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
