import assert from 'node:assert/strict';
import test from 'node:test';
import { chatCompletion, visionMessages } from '../lib/openai.js';
import { PdfDocument } from '../lib/pdf.js';

test('chatCompletion sends a system prompt, bearer key and reads content', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  try {
    globalThis.fetch = async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ choices: [{ message: { content: '整理结果' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const output = await chatCompletion({
      baseURL: 'https://api.example.com/v1/',
      apiKey: 'sk-test',
      model: 'cheap',
      system: '系统提示',
      messages: [{ role: 'user', content: [{ type: 'text', text: '原文' }] }],
      maxTokens: 128,
    });
    assert.equal(output, '整理结果');
    assert.equal(captured.url, 'https://api.example.com/v1/chat/completions');
    assert.equal(captured.init.headers.authorization, 'Bearer sk-test');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.model, 'cheap');
    assert.equal(body.max_tokens, 128);
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[1].role, 'user');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('chatCompletion turns HTTP errors into readable failures', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('invalid key', { status: 401 });
    await assert.rejects(
      () => chatCompletion({ baseURL: 'https://api.example.com/v1', apiKey: 'bad', model: 'm', messages: [{ role: 'user', content: 'x' }] }),
      /HTTP 401.*invalid key/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('visionMessages embeds images as data URLs', () => {
  const messages = visionMessages('描述页面', [{ mime: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff]) }]);
  assert.equal(messages[0].content[0].text, '描述页面');
  assert.match(messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
});

function pdfWithObjects(objects, tail = '') {
  let out = '%PDF-1.4\n';
  for (const [num, body] of Object.entries(objects)) out += `${num} 0 obj\n${body}\nendobj\n`;
  return Buffer.from(`${out}${tail}%%EOF`, 'latin1');
}

test('extractImages returns embedded JPEG page scans', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(5000, 0x20), Buffer.from([0xff, 0xd9])]);
  const header = Buffer.from('<< /Type /XObject /Subtype /Image /Width 1000 /Height 1400 /Filter /DCTDecode /Length 5004 >>\nstream\n', 'latin1');
  const footer = Buffer.from('\nendstream', 'latin1');
  const buffer = Buffer.concat([Buffer.from('%PDF-1.4\n2 0 obj\n', 'latin1'), header, jpeg, footer, Buffer.from('\nendobj\n%%EOF', 'latin1')]);
  const images = new PdfDocument(buffer).extractImages({ limit: 4 });
  assert.equal(images.length, 1);
  assert.equal(images[0].mime, 'image/jpeg');
  assert.equal(images[0].data[0], 0xff);
  assert.equal(images[0].width, 1000);
});

test('extractImages converts flate RGB bitmaps to PNG', async () => {
  const { deflateSync } = await import('node:zlib');
  const width = 128;
  const height = 128;
  const raw = Buffer.alloc(width * height * 3);
  for (let index = 0; index < raw.length; index += 1) raw[index] = (index * 37) % 251;
  const compressed = deflateSync(raw);
  const buffer = pdfWithObjects(
    { 2: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString('latin1')}\nendstream` },
  );
  const images = new PdfDocument(buffer).extractImages({ limit: 4 });
  assert.equal(images.length, 1);
  assert.equal(images[0].mime, 'image/png');
  assert.deepEqual([...images[0].data.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('vision conversion and verification use the injected chat client', async () => {
  const { convertWithVision, verifyWithVision } = await import('../lib/vision.js');
  const image = { mime: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };
  const settings = { baseURL: 'https://api.example.com/v1', model: 'text-m', visionModel: 'vision-m', temperature: 0.2 };
  const prompts = [];
  const chat = async ({ system, messages }) => {
    prompts.push(system);
    if (system.includes('校对员')) return '{"ok":false,"issues":["第 2 页型号数字可能看错"]}';
    return '<<<SUMMARY>>>\n图文转写摘要\n<<<TAGS>>>\n视觉, 手册\n<<<CONTENT>>>\n# 图文标题\n\n第一页正文。';
  };
  const converted = await convertWithVision({ settings, apiKey: 'k', images: [image, image], title: '测试文档', chat });
  assert.equal(converted.mode, 'vision');
  assert.match(converted.content, /第一页正文/);
  assert.equal(converted.summary, '图文转写摘要');
  assert.deepEqual(converted.tags, ['视觉', '手册']);

  const check = await verifyWithVision({ settings, apiKey: 'k', images: [image], markdown: converted.content, title: '测试文档', chat });
  assert.equal(check.ok, false);
  assert.match(check.issues[0], /型号/);
  assert.ok(prompts.some((system) => system.includes('校对员')));
});
