// 冒烟测试：对着正在运行的 DSH Web 端验证资料库 API（创建 → 导入 → 转化 → 预览）。
// 用法：node tools/smoke.mjs http://127.0.0.1:PORT [--keep]
const base = process.argv[2] || process.env.DSH_WEB_URL || 'http://127.0.0.1:50965';
const keep = process.argv.includes('--keep');

async function api(method, body) {
  const response = await fetch(`${base}/dsh-kb/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json().catch(() => null);
  if (payload === null || payload.ok !== true) {
    throw new Error(`${method}: HTTP ${response.status} ${payload?.error?.message ?? ''}`);
  }
  return payload.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const health = await fetch(`${base}/dsh-kb/api/health`).then((response) => response.json());
console.log('health:', JSON.stringify(health.value));

const kb = await api('kb.create', { title: '冒烟测试库', description: '验证导入、转化、检索链路；验证后会删除' });
console.log('kb:', kb.id, kb.title);

const pasted = await api('doc.paste', {
  kbId: kb.id,
  title: '资料库优先规则',
  text: [
    '资料库优先规则（冒烟测试样本）。',
    '',
    '一、回答与资料库主题相关的问题之前，必须先检索资料库，再决定是否需要网络搜索。',
    '二、资料库与网络来源出现轻微歧义时，以资料库为准，并在回答末尾注明差异。',
    '三、出现关键事实冲突时，立即停止作答，向用户说明冲突双方并请其裁决。',
  ].join('\n'),
});
console.log('pasted:', pasted.doc.id, pasted.doc.status);

const job = await api('doc.convert', { kbId: kb.id, docId: pasted.doc.id });
let current = job;
const started = Date.now();
while (current.status === 'running' && Date.now() - started < 120000) {
  await sleep(1500);
  current = await api('job.get', { id: job.id });
}
console.log('convert:', current.status, current.error ? JSON.stringify(current.error) : '', current.result?.chunks ? `${current.result.chunks} chunk(s)` : '');

const docs = await api('docs.list', { kbId: kb.id });
for (const doc of docs) console.log('doc:', doc.id, doc.status, doc.kind, doc.chars, doc.summary ? `summary=${doc.summary}` : '', doc.tags.length ? `tags=${doc.tags.join(',')}` : '');

if (docs.length > 0) {
  const preview = await api('doc.preview', { kbId: kb.id, docId: docs[0].id, limit: 400 });
  console.log('preview chars:', preview.text.length, 'truncated:', preview.truncated);
}

console.log('KB_ID=' + kb.id);
console.log('DOC_ID=' + (docs[0]?.id ?? pasted.doc.id));

if (!keep) {
  await api('kb.delete', { kbId: kb.id });
  console.log('cleaned up:', kb.id);
}
