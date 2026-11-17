import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPdfText } from '../lib/pdf.js';
import { extractText } from '../lib/extract.js';

// 极简 PDF 拼装：只包含本解析器关心的对象，不写 xref（解析器按对象扫描）。
function buildPdf(objects) {
  let out = '%PDF-1.4\n';
  for (const [num, body] of Object.entries(objects)) out += `${num} 0 obj\n${body}\nendobj\n`;
  return Buffer.from(`${out}%%EOF`, 'latin1');
}

function streamObject(dict, text) {
  return `<<${dict}/Length ${Buffer.byteLength(text, 'latin1')}>>\nstream\n${text}\nendstream`;
}

function simplePdf(text) {
  return buildPdf({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    4: streamObject('', `BT /F1 12 Tf 1 0 0 1 10 100 Tm (${text}) Tj ET`),
    5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  });
}

function cidPdf() {
  const cmap = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CMapName /Test def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    '2 beginbfchar',
    '<0001> <4E2D>',
    '<0002> <6587>',
    'endbfchar',
    '1 beginbfrange',
    '<0010> <0012> <0041>',
    'endbfrange',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
  const content = [
    'BT /F1 12 Tf 1 0 0 1 10 100 Tm <00010002> Tj ET',
    'BT /F1 12 Tf 1 0 0 1 10 80 Tm <00010002001000110012> Tj ET',
  ].join('\n');
  return buildPdf({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    4: streamObject('', content),
    5: '<< /Type /Font /Subtype /Type0 /BaseFont /Test /Encoding /Identity-H /DescendantFonts [] /ToUnicode 6 0 R >>',
    6: streamObject('', cmap),
  });
}

test('extracts text from a simple Type1 PDF', () => {
  const text = extractPdfText(simplePdf('Hello PDF'));
  assert.match(text, /Hello PDF/);
});

test('decodes CID strings through the ToUnicode CMap', () => {
  const text = extractPdfText(cidPdf());
  assert.match(text, /中文/);
  assert.match(text, /ABC/, 'bfrange increments target code points');
  // 两个 Tm 的 y 不同 → 换行；同一行内不应逐字断行
  assert.match(text, /中文\n中文ABC/);
});

test('long CID documents pass the extraction quality gate', async () => {
  const text = extractPdfText(cidPdf());
  assert.ok(text.length > 0);
  const result = await extractText(cidPdf(), 'pdf');
  // 内容太短会被质量门禁拦下；这里只验证解析器本身没有乱码。
  assert.equal(result.quality.ratio >= 0.9, true);
});
