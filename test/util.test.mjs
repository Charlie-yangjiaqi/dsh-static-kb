import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeEntities, htmlToText, parseConversion, splitForModel, textQuality } from '../lib/util.js';

test('decodeEntities handles named and numeric entities', () => {
  assert.equal(decodeEntities('a &amp; b &#20320;&#22909; &#x4e16;&#x754c; &nbsp;'), 'a & b 你好 世界  ');
});

test('htmlToText keeps paragraph boundaries and drops scripts', () => {
  const html = '<html><head><style>.a{}</style><script>alert(1)</script></head><body><h1>第一章</h1><p>实践是检验真理的唯一标准。</p><p>第二段 &amp; 结论</p></body></html>';
  const text = htmlToText(html);
  assert.match(text, /第一章/);
  assert.match(text, /实践是检验真理的唯一标准/);
  assert.match(text, /第二段 & 结论/);
  assert.doesNotMatch(text, /alert/);
  assert.doesNotMatch(text, /\.a\{\}/);
});

test('textQuality rejects mojibake and accepts CJK prose', () => {
  assert.equal(
    textQuality('这是一个用来测试质量门禁的中文段落，长度足够并且字符正常；它应当通过检查，而不是被当成乱码丢弃。').ok,
    true,
  );
  const garbage = 'ÿþ\u0001\u0002\u0003'.repeat(30);
  assert.equal(textQuality(garbage).ok, false);
});

test('parseConversion reads delimited model output', () => {
  const parsed = parseConversion(
    '<<<SUMMARY>>>\n讲实践与认识的关系。\n<<<TAGS>>>\n哲学, 认识论\n<<<CONTENT>>>\n# 实践论\n\n正文第一段。',
    '实践论',
  );
  assert.equal(parsed.title, '实践论');
  assert.equal(parsed.summary, '讲实践与认识的关系。');
  assert.deepEqual(parsed.tags, ['哲学', '认识论']);
  assert.match(parsed.content, /正文第一段/);
});

test('parseConversion falls back to raw text', () => {
  const parsed = parseConversion('没有分隔符的纯文本', '备用标题');
  assert.equal(parsed.title, '备用标题');
  assert.equal(parsed.content, '没有分隔符的纯文本');
});

test('splitForModel keeps every character and respects budget', () => {
  const source = `${'段落内容。\n\n'.repeat(400)}结尾`;
  const chunks = splitForModel(source, 500);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 500);
  assert.equal(chunks.join('').replace(/\s/g, ''), source.replace(/\s/g, ''));
});
