import assert from 'node:assert/strict';
import test from 'node:test';
import { extractText } from '../lib/extract.js';
import { extractPptx, extractXlsx } from '../lib/office.js';
import { openCfb } from '../lib/cfb.js';
import { buildZip } from './zipfixture.mjs';

// ---------------------------------------------------------------- XLSX / PPTX

function xlsxFixture() {
  return buildZip({
    'xl/workbook.xml': '<?xml version="1.0"?><workbook><sheets><sheet name="参数表" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>型号</t></si><si><t>额定电流</t></si><si><t>YC-350</t></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>350</v></c></row>' +
      '<row r="3"><c r="A3" t="inlineStr"><is><t>备注</t></is></c><c r="B3" t="b"><v>1</v></c></row>' +
      '</sheetData></worksheet>',
  });
}

function pptxFixture() {
  return buildZip({
    'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships><Relationship Id="rId2" Type="slide" Target="slides/slide2.xml"/><Relationship Id="rId3" Type="slide" Target="slides/slide1.xml"/></Relationships>',
    'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>第一页标题</a:t></a:r></a:p><a:p><a:r><a:t>第二段</a:t></a:r></a:p></p:sld>',
    'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>封面</a:t></a:r></a:p></p:sld>',
  });
}

test('xlsx extraction reads shared strings, inline strings, numbers and booleans', async () => {
  const text = extractXlsx(xlsxFixture());
  assert.match(text, /工作表：参数表/);
  assert.match(text, /型号\t额定电流/);
  assert.match(text, /YC-350\t350/);
  assert.match(text, /备注\tTRUE/);
  const extracted = await extractText(xlsxFixture(), 'xlsx');
  assert.equal(extracted.quality.ratio, 1);
  assert.match(extracted.text, /YC-350/);
});

test('pptx extraction follows the presentation slide order', async () => {
  const text = extractPptx(pptxFixture());
  const first = text.indexOf('封面');
  const second = text.indexOf('第一页标题');
  assert.ok(first >= 0 && second > first, text);
  assert.match(text, /## 幻灯片 1/);
  assert.match(text, /第二段/);
});

// ---------------------------------------------------------------- PPT（CFB）

function buildCfb(streamName, streamBytes) {
  const sectorSize = 512;
  const padding = (sectorSize - (streamBytes.length % sectorSize)) % sectorSize;
  const streamPadded = Buffer.concat([streamBytes, Buffer.alloc(padding)]);
  const streamSectors = Math.max(1, streamPadded.length / sectorSize);

  const dirEntries = [];
  const makeEntry = (name, type, start, size) => {
    const entry = Buffer.alloc(128);
    const nameBuffer = Buffer.from(`${name}\u0000`, 'utf16le');
    nameBuffer.copy(entry, 0);
    entry.writeUInt16LE(nameBuffer.length, 64);
    entry.writeUInt8(type, 66);
    entry.writeUInt32LE(0xffffffff, 68);
    entry.writeUInt32LE(0xffffffff, 72);
    entry.writeUInt32LE(0xffffffff, 76);
    entry.writeUInt32LE(start, 116);
    entry.writeUInt32LE(size, 120);
    return entry;
  };
  dirEntries.push(makeEntry('Root Entry', 5, 0xfffffffe, 0));
  dirEntries.push(makeEntry(streamName, 2, 2, streamBytes.length));
  while (dirEntries.length * 128 < sectorSize) dirEntries.push(Buffer.alloc(128));
  const dirBuffer = Buffer.concat(dirEntries);

  const totalSectors = 2 + streamSectors;
  const fat = Buffer.alloc(sectorSize, 0xff);
  fat.writeUInt32LE(0xfffffffd, 0); // FAT 扇区自身
  fat.writeUInt32LE(0xfffffffe, 4); // 目录扇区结束
  for (let index = 0; index < streamSectors; index += 1) {
    const sector = 2 + index;
    const next = index === streamSectors - 1 ? 0xfffffffe : sector + 1;
    fat.writeUInt32LE(next, sector * 4);
  }

  const header = Buffer.alloc(sectorSize);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(0x0003, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30); // 512 字节扇区
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44); // FAT 扇区数
  header.writeUInt32LE(1, 48); // 目录起始扇区
  header.writeUInt32LE(0, 56); // miniCutoff = 0：全部走 FAT
  header.writeUInt32LE(0xfffffffe, 60);
  header.writeUInt32LE(0, 64);
  header.writeUInt32LE(0xfffffffe, 68);
  header.writeUInt32LE(0, 72);
  for (let index = 0; index < 109; index += 1) header.writeUInt32LE(0xffffffff, 76 + index * 4);
  header.writeUInt32LE(0, 76); // DIFAT[0] = 扇区 0（FAT）

  return Buffer.concat([header, fat, dirBuffer, streamPadded]);
}

function pptRecord(type, body, container = false) {
  const header = Buffer.alloc(8);
  header.writeUInt16LE(container ? 0x000f : 0x0000, 0);
  header.writeUInt16LE(type, 2);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

test('cfb reader returns a named stream', () => {
  const stream = Buffer.from('hello ole', 'latin1');
  const cfb = openCfb(buildCfb('Test Stream', stream));
  assert.ok(cfb !== null);
  assert.ok(cfb.names.includes('Test Stream'));
  assert.equal(cfb.read('Test Stream').toString('latin1'), 'hello ole');
});

test('ppt extraction reads text atoms from the PowerPoint stream', async () => {
  const chars = Buffer.from('中文标题', 'utf16le');
  const body = Buffer.concat([
    pptRecord(0x0fa0, chars),
    pptRecord(0x03f3, Buffer.alloc(0)),
    pptRecord(0x0fa8, Buffer.from('SlideABC', 'latin1')),
  ]);
  const cfb = buildCfb('PowerPoint Document', body);
  const extracted = await extractText(cfb, 'ppt');
  assert.match(extracted.text, /中文标题/);
  assert.match(extracted.text, /幻灯片 1/);
  assert.match(extracted.text, /SlideABC/);
});

// ---------------------------------------------------------------- 降级

test('legacy xls/doc with invalid content degrade gracefully', async () => {
  const garbage = Buffer.from('not a real office file', 'utf8');
  for (const kind of ['xls', 'doc']) {
    const extracted = await extractText(garbage, kind);
    assert.equal(typeof extracted.text, 'string');
    assert.equal(extracted.text, '');
  }
});

test('detectKind maps the new office extensions', async () => {
  const { detectKind } = await import('../lib/extract.js');
  assert.equal(detectKind('a.xlsx'), 'xlsx');
  assert.equal(detectKind('a.xls'), 'xls');
  assert.equal(detectKind('a.pptx'), 'pptx');
  assert.equal(detectKind('a.ppt'), 'ppt');
  assert.equal(detectKind('a.doc'), 'doc');
  assert.equal(detectKind('noext', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
  assert.equal(detectKind('noext', 'application/msword'), 'doc');
});
