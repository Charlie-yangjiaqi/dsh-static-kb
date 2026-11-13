// 冒烟测试 2：PDF / HTML 导入与预览、绑定往返。
// 用法：node tools/smoke2.mjs <GUI_BASE_URL> <KB_ID> [--cleanup]
const base = process.argv[2];
const kbId = process.argv[3];
const cleanup = process.argv.includes('--cleanup');
if (!base || !kbId) {
  console.error('usage: node tools/smoke2.mjs <base> <kbId> [--cleanup]');
  process.exit(2);
}

async function api(method, body) {
  const response = await fetch(`${base}/dsh-kb/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json();
  if (payload.ok !== true) throw new Error(`${method}: ${payload.error?.message ?? response.status}`);
  return payload.value;
}

function buildPdf(text) {
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const stream = `BT /F1 16 Tf 72 720 Td (${text}) Tj 0 -26 Td (The library is the primary source of truth.) Tj ET`;
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const pdf = buildPdf('Knowledge Base Integration Test');
const pdfResult = await api('doc.import', { kbId, name: 'integration-test.pdf', mime: 'application/pdf', dataBase64: pdf.toString('base64') });
console.log('pdf:', pdfResult.doc.status, 'chars=' + pdfResult.doc.chars, 'kind=' + pdfResult.doc.kind, 'quality=' + JSON.stringify(pdfResult.extraction));

const html = `<!doctype html><html><head><meta charset="utf-8"><title>资料库测试页</title></head><body><h1>资料库测试页</h1><p>这是一个用于验证 HTML 导入与预览的页面。</p><p>第二段：资料库优先，网络为辅。</p><script>window.__evil = true;</script></body></html>`;
const htmlResult = await api('doc.import', { kbId, name: 'note.html', mime: 'text/html', dataBase64: Buffer.from(html, 'utf8').toString('base64') });
console.log('html:', htmlResult.doc.status, 'chars=' + htmlResult.doc.chars, 'kind=' + htmlResult.doc.kind);

const preview = await api('doc.preview', { kbId, docId: htmlResult.doc.id, limit: 2000 });
console.log('html preview text:', JSON.stringify(preview.text.slice(0, 80)));

const rawtext = await api('doc.rawtext', { kbId, docId: htmlResult.doc.id });
console.log('html raw length:', rawtext.text.length, 'contains script:', rawtext.text.includes('__evil'));

const bound = await api('bind.set', { sessionId: 'smoke-session', kbId });
console.log('bind:', bound.title);
const overview = await api('overview', { sessionId: 'smoke-session' });
console.log('overview binding:', overview.binding?.title, 'kbs:', overview.kbs.length, 'docs:', overview.kbs[0]?.docCount);
const cleared = await api('bind.set', { sessionId: 'smoke-session', kbId: null });
console.log('unbind:', JSON.stringify(cleared));

const docs = await api('docs.list', { kbId });
console.log('docs:', docs.map((doc) => `${doc.title}[${doc.kind}/${doc.status}/${doc.chars}]`).join(' | '));

if (cleanup) {
  for (const doc of docs) await api('doc.delete', { kbId, docId: doc.id });
  console.log('cleaned docs');
}
