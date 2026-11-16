// PDF 文本抽取（无第三方依赖，支持中文 CID 字体）。
//
// 很多中文 PDF 用 Type0 + Identity-H 字体：字符串里是 2 字节 CID，不是 Unicode。
// 只按字节读出来会是乱码，必须借每页字体资源里的 /ToUnicode CMap 反查。
// 这里实现最小解析器：扫描对象（含 ObjStm）、还原页面树、按页取字体与内容流、
// 解析 CMap 的 bfchar/bfrange，再按当前 Tf 字体解码字符串。
import { constants as zlibConstants, deflateSync, inflateSync } from 'node:zlib';

const MAX_DECODED_STREAM = 64 * 1024 * 1024;

export function extractPdfText(buffer) {
  const doc = new PdfDocument(buffer);
  const pages = doc.pages();
  const chunks = [];
  for (const page of pages.slice(0, 5000)) {
    const text = doc.pageText(page);
    if (text.trim() !== '') chunks.push(text);
  }
  return chunks.join('\n').trim();
}

/** PDF 页数（用于视觉转化进度与「继续转化」）。解析失败返回 0。 */
export function pdfPageCount(buffer) {
  try {
    return new PdfDocument(buffer).pages().length;
  } catch {
    return 0;
  }
}

class PdfDocument {
  constructor(buffer) {
    this.latin = buffer.toString('latin1');
    this.objects = new Map();
    this.fontCache = new Map();
    this.scanObjects();
    this.expandObjectStreams();
  }

  // ------------------------------------------------------------------ objects

  scanObjects() {
    const source = this.latin;
    const re = /(\d+)\s+\d+\s+obj\b/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      const num = Number(match[1]);
      const bodyStart = match.index + match[0].length;
      const streamAt = source.indexOf('stream', bodyStart);
      const endObjAt = source.indexOf('endobj', bodyStart);
      const hasStream = streamAt !== -1 && (endObjAt === -1 || streamAt < endObjAt) && /stream\r?\n/.test(source.slice(streamAt, streamAt + 8));

      if (hasStream) {
        let dataStart = streamAt + 6;
        if (source[dataStart] === '\r') dataStart += 1;
        if (source[dataStart] === '\n') dataStart += 1;
        const endStream = source.indexOf('endstream', dataStart);
        const dataEnd = endStream === -1 ? source.length : endStream;
        this.objects.set(num, {
          num,
          dict: source.slice(bodyStart, streamAt),
          raw: this.bufferSlice(dataStart, dataEnd),
        });
        re.lastIndex = Math.max(re.lastIndex, dataEnd + 9);
      } else {
        const dictEnd = endObjAt === -1 ? source.length : endObjAt;
        this.objects.set(num, { num, dict: source.slice(bodyStart, dictEnd), raw: null });
        re.lastIndex = Math.max(re.lastIndex, dictEnd + 6);
      }
    }
  }

  bufferSlice(start, end) {
    if (this._buffer === undefined) {
      this._buffer = Buffer.from(this.latin, 'latin1');
    }
    return this._buffer.subarray(start, end);
  }

  expandObjectStreams() {
    for (const object of [...this.objects.values()]) {
      if (!/\/Type\s*\/ObjStm/.test(object.dict)) continue;
      const text = this.streamText(object);
      if (text === '') continue;
      const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
      const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
      const header = text.slice(0, first).trim().split(/\s+/).map(Number);
      if (!Number.isFinite(count) || header.length < count * 2) continue;
      for (let index = 0; index < count; index += 1) {
        const num = header[index * 2];
        const offset = header[index * 2 + 1];
        const nextOffset = index + 1 < count ? header[(index + 1) * 2 + 1] : text.length - first;
        if (!Number.isInteger(num) || !Number.isInteger(offset) || !Number.isInteger(nextOffset)) continue;
        if (this.objects.has(num)) continue;
        this.objects.set(num, { num, dict: text.slice(first + offset, first + nextOffset), raw: null });
      }
    }
  }

  object(num) {
    return this.objects.get(num);
  }

  streamText(object) {
    const data = this.streamBinary(object);
    if (data === null) return '';
    if (object.decodedText !== undefined) return object.decodedText;
    object.decodedText = data.toString('latin1');
    return object.decodedText;
  }

  streamBinary(object) {
    if (object === undefined || object.raw === null) return null;
    if (object.decodedBinary !== undefined) return object.decodedBinary;
    let data = object.raw;
    if (/\/Filter\s*(?:\/FlateDecode|\/Fl\b)/.test(object.dict)) {
      try {
        data = inflateSync(data, { maxOutputLength: MAX_DECODED_STREAM });
      } catch {
        try {
          data = inflateSync(data, { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: MAX_DECODED_STREAM });
        } catch {
          data = Buffer.alloc(0);
        }
      }
    }
    object.decodedBinary = data;
    return data;
  }

  /** 抽取内嵌页面图片（扫描件常见 JPEG；Flate 位图转 PNG）。优先按页面顺序取。 */
  extractImages({ limit = 8, maxBytes = 12 * 1024 * 1024 } = {}) {
    const images = [];
    const seen = new Set();
    let total = 0;
    const add = (object) => {
      if (object === undefined || seen.has(object.num) || images.length >= limit || total >= maxBytes) return;
      seen.add(object.num);
      const image = this.decodeImage(object);
      if (image === null) return;
      images.push(image);
      total += image.data.length;
    };
    for (const page of this.pages()) {
      if (images.length >= limit || total >= maxBytes) break;
      const resources = page.resources ?? null;
      if (resources === null) continue;
      const xobjects = /\/XObject\s*<</.test(resources) ? this.inlineDict(resources, 'XObject') : this.dictOf(resources, 'XObject');
      if (xobjects === null) continue;
      for (const match of xobjects.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+\d+\s+R/g)) add(this.object(Number(match[2])));
    }
    if (images.length === 0) {
      for (const object of this.objects.values()) {
        if (images.length >= limit || total >= maxBytes) break;
        add(object);
      }
    }
    return images;
  }

  decodeImage(object) {
    if (!/\/Subtype\s*\/Image\b/.test(object.dict) || object.raw === null) return null;
    if (/\/ImageMask\s+true/.test(object.dict)) return null;
    const filter = /\/Filter\s*\/([A-Za-z0-9]+)/.exec(object.dict)?.[1] ?? '';
    const width = Number(/\/Width\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
    const height = Number(/\/Height\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
    if (filter === 'DCTDecode' || filter === 'DCT') {
      if (object.raw.length < 4096) return null;
      return { mime: 'image/jpeg', data: object.raw, width, height };
    }
    if (filter === '' || filter === 'FlateDecode' || filter === 'Fl') {
      const bits = Number(/\/BitsPerComponent\s+(\d+)/.exec(object.dict)?.[1] ?? 8);
      const color = /\/ColorSpace\s*\/([A-Za-z0-9]+)/.exec(object.dict)?.[1] ?? 'DeviceRGB';
      if (bits !== 8 || (color !== 'DeviceRGB' && color !== 'DeviceGray') || width <= 0 || height <= 0) return null;
      if (width * height > 40_000_000) return null;
      const raw = this.streamBinary(object);
      if (raw === null) return null;
      const channels = color === 'DeviceRGB' ? 3 : 1;
      if (raw.length < width * height * channels) return null;
      const png = encodePng(raw.subarray(0, width * height * channels), width, height, channels);
      if (png.length < 512) return null;
      return { mime: 'image/png', data: png, width, height };
    }
    return null;
  }

  // --------------------------------------------------------------- references

  ref(dict, key) {
    const match = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict);
    return match === null ? null : Number(match[1]);
  }

  inlineDict(dict, key) {
    const at = new RegExp(`/${key}\\s*<<`).exec(dict);
    if (at === null) return null;
    const start = at.index + at[0].length - 2;
    return extractBalanced(dict, start);
  }

  dictOf(dict, key) {
    const inline = this.inlineDict(dict, key);
    if (inline !== null) return inline;
    const ref = this.ref(dict, key);
    return ref === null ? null : (this.object(ref)?.dict ?? null);
  }

  // ------------------------------------------------------------------- pages

  pages() {
    const order = [];
    const seen = new Set();
    const parents = new Map();
    const walk = (num, inherited, parent) => {
      if (seen.has(num)) return;
      seen.add(num);
      const object = this.object(num);
      if (object === undefined) return;
      const dict = object.dict;
      const ownResources = /\/Resources\b/.test(dict) ? this.dictOf(dict, 'Resources') : null;
      const resources = ownResources ?? inherited;
      if (parent !== null) parents.set(num, parent);
      if (/\/Type\s*\/Page\b(?!s)/.test(dict)) {
        order.push({ num, resources });
        return;
      }
      const kids = /\/Kids\s*\[([\s\S]*?)\]/.exec(dict);
      if (kids === null) return;
      for (const kid of kids[1].matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(kid[1]), resources, num);
    };

    let root = null;
    for (const object of this.objects.values()) {
      if (/\/Type\s*\/Catalog/.test(object.dict)) {
        root = this.ref(object.dict, 'Pages');
        if (root !== null) break;
      }
    }
    if (root !== null) walk(root, null, null);
    if (order.length === 0) {
      for (const object of this.objects.values()) {
        if (/\/Type\s*\/Page\b(?!s)/.test(object.dict)) {
          order.push({ num: object.num, resources: this.dictOf(object.dict, 'Resources') });
        }
      }
    }
    this.parents = parents;
    return order;
  }

  // ------------------------------------------------------------------- fonts

  fontMap(resources) {
    if (this.globalFonts === undefined) {
      // 有些 PDF 的字体资源挂在页外/对象流里；用字体字典自带的 /Name 兜底。
      this.globalFonts = new Map();
      for (const object of this.objects.values()) {
        if (!/\/Type\s*\/Font\b/.test(object.dict)) continue;
        const named = /\/Name\s*\/([A-Za-z0-9_.+-]+)/.exec(object.dict);
        if (named !== null && !this.globalFonts.has(named[1])) this.globalFonts.set(named[1], object.num);
      }
    }
    if (resources === null) return new Map(this.globalFonts);
    const fontDict = /\/Font\s*<</.test(resources) ? this.inlineDict(resources, 'Font') : this.dictOf(resources, 'Font');
    const map = new Map();
    if (fontDict !== null) {
      for (const match of fontDict.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+\d+\s+R/g)) {
        map.set(match[1], Number(match[2]));
      }
    }
    for (const [name, num] of this.globalFonts) if (!map.has(name)) map.set(name, num);
    return map;
  }

  fontInfo(fontNum) {
    if (this.fontCache.has(fontNum)) return this.fontCache.get(fontNum);
    const dict = this.object(fontNum)?.dict ?? '';
    const type0 = /\/Subtype\s*\/Type0/.test(dict) || /\/Identity-[HV]/.test(dict);
    const cmapRef = this.ref(dict, 'ToUnicode');
    const cmap = cmapRef === null ? null : parseCMap(this.streamText(this.object(cmapRef)));
    const info = { cmap, twoByte: type0 || cmap?.codeBytes === 2 };
    this.fontCache.set(fontNum, info);
    return info;
  }

  // --------------------------------------------------------------- page text

  pageText(page) {
    const content = this.pageContent(page);
    if (content === '') return '';
    const fonts = this.fontMap(page.resources ?? null);
    return extractTextFromContent(content, (name) => {
      const num = fonts.get(name);
      return num === undefined ? null : this.fontInfo(num);
    });
  }

  pageContent(page) {
    const object = this.object(page.num);
    if (object === undefined) return '';
    const contents = [];
    const inlineArray = /\/Contents\s*\[([\s\S]*?)\]/.exec(object.dict);
    const contentRef = this.ref(object.dict, 'Contents');
    const refs = inlineArray !== null ? [...inlineArray[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((match) => Number(match[1])) : contentRef === null ? [] : [contentRef];
    for (const ref of refs) {
      const stream = this.object(ref);
      if (stream !== undefined) contents.push(this.streamText(stream));
    }
    return contents.join('\n');
  }
}

// ---------------------------------------------------------------- CMap 解析

function parseCMap(text) {
  if (text === '') return null;
  const map = new Map();
  let codeBytes = null;

  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text);
  if (space !== null) codeBytes = Math.max(1, Math.ceil(space[1].length / 2));

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(Number.parseInt(pair[1], 16), utf16FromHex(pair[2]));
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const entry = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[([\s\S]*?)\])/g;
    let match;
    while ((match = entry.exec(block[1])) !== null) {
      const low = Number.parseInt(match[1], 16);
      const high = Number.parseInt(match[2], 16);
      if (!Number.isFinite(low) || !Number.isFinite(high) || high < low || high - low > 0xffff) continue;
      if (match[3] !== undefined) {
        const start = Number.parseInt(match[3], 16);
        const width = Math.max(4, match[3].length);
        for (let code = low; code <= high; code += 1) {
          map.set(code, utf16FromHex((start + (code - low)).toString(16).padStart(width, '0')));
        }
      } else {
        const targets = [...match[4].matchAll(/<([0-9a-fA-F]*)>/g)].map((item) => utf16FromHex(item[1]));
        for (let index = 0; index < targets.length && low + index <= high; index += 1) {
          map.set(low + index, targets[index]);
        }
      }
    }
  }

  if (map.size === 0) return null;
  if (codeBytes === null) codeBytes = 2;
  return { map, codeBytes };
}

function utf16FromHex(hex) {
  let out = '';
  const value = hex.length % 2 === 1 ? `0${hex}` : hex;
  for (let index = 0; index + 3 < value.length + 1; index += 4) {
    const unit = Number.parseInt(value.slice(index, index + 4).padEnd(4, '0'), 16);
    if (Number.isFinite(unit)) out += String.fromCharCode(unit);
  }
  return out;
}

// ------------------------------------------------------------- 内容流解析

function decodePdfString(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) out += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return out;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    let out = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) out += String.fromCharCode(bytes[index] | (bytes[index + 1] << 8));
    return out;
  }
  let out = '';
  for (const byte of bytes) out += byte >= 0x20 || byte === 0x0a || byte === 0x09 ? String.fromCharCode(byte) : ' ';
  return out;
}

function decodeWithFont(bytes, info) {
  if (info !== null && info.cmap !== null) {
    const step = info.twoByte || info.cmap.codeBytes === 2 ? 2 : 1;
    let out = '';
    for (let index = 0; index + step <= bytes.length; index += step) {
      const code = step === 2 ? (bytes[index] << 8) | bytes[index + 1] : bytes[index];
      const mapped = info.cmap.map.get(code);
      if (mapped !== undefined) out += mapped;
    }
    // 有 ToUnicode 就以它为准：未覆盖的码点宁可丢掉，也不要退回按字节硬读成乱码。
    return out;
  }
  // 已知是简单字体（WinAnsi/自定义编码）且没有 ToUnicode 时，高位字节通常对应
  // 装饰符号或子集私有字形，按字符读出来只是乱码；只保留 ASCII，避免污染质量评估。
  if (info !== null && info.cmap === null && info.twoByte === false) {
    let out = '';
    for (const byte of bytes) {
      if (byte >= 0x20 && byte <= 0x7e) out += String.fromCharCode(byte);
      else if (byte === 0x0a || byte === 0x09) out += ' ';
    }
    return out;
  }
  // 双字节 CID 字体缺少 ToUnicode 时无法还原，宁可丢弃也不要输出按字节硬读的乱码。
  if (info !== null && info.cmap === null && info.twoByte === true) return '';
  // 字体资源没解析出来时同样只保留 ASCII，避免把字形索引当拉丁字符写进正文。
  if (info === null) {
    let out = '';
    for (const byte of bytes) {
      if (byte >= 0x20 && byte <= 0x7e) out += String.fromCharCode(byte);
      else if (byte === 0x0a || byte === 0x09) out += ' ';
    }
    return out;
  }
  return decodePdfString(bytes);
}

function readLiteralString(source, start) {
  const bytes = [];
  let depth = 1;
  let index = start;
  while (index < source.length && depth > 0) {
    const ch = source[index];
    if (ch === '\\') {
      const next = source[index + 1];
      index += 2;
      switch (next) {
        case 'n': bytes.push(0x0a); break;
        case 'r': bytes.push(0x0d); break;
        case 't': bytes.push(0x09); break;
        case 'b': bytes.push(0x08); break;
        case 'f': bytes.push(0x0c); break;
        case '(': bytes.push(0x28); break;
        case ')': bytes.push(0x29); break;
        case '\\': bytes.push(0x5c); break;
        case '\n': break;
        case '\r': if (source[index] === '\n') index += 1; break;
        default: {
          if (/[0-7]/.test(next ?? '')) {
            let octal = next;
            for (let extra = 0; extra < 2 && /[0-7]/.test(source[index] ?? ''); extra += 1) {
              octal += source[index];
              index += 1;
            }
            bytes.push(Number.parseInt(octal, 8) & 0xff);
          } else if (next !== undefined) {
            bytes.push(next.charCodeAt(0) & 0xff);
          }
        }
      }
      continue;
    }
    if (ch === '(') { depth += 1; bytes.push(0x28); index += 1; continue; }
    if (ch === ')') { depth -= 1; if (depth === 0) { index += 1; break; } bytes.push(0x29); index += 1; continue; }
    bytes.push(ch.charCodeAt(0) & 0xff);
    index += 1;
  }
  return { bytes, end: index };
}

function readHexString(source, start) {
  const end = source.indexOf('>', start);
  if (end < 0) return { bytes: [], end: start };
  const digits = source.slice(start, end).replace(/[^0-9a-fA-F]/g, '');
  const bytes = [];
  for (let index = 0; index + 1 < digits.length; index += 2) bytes.push(Number.parseInt(digits.slice(index, index + 2), 16));
  if (digits.length % 2 === 1) bytes.push(Number.parseInt(`${digits.slice(-1)}0`, 16));
  return { bytes, end: end + 1 };
}

function extractTextFromContent(source, fontLookup) {
  let out = '';
  let index = 0;
  let currentFont = null;
  let lastY = null;
  const lineBreak = () => {
    if (!out.endsWith('\n')) out += '\n';
  };
  const moveTo = (y) => {
    if (Number.isFinite(y)) {
      if (lastY !== null && Math.abs(y - lastY) > 1.5) lineBreak();
      lastY = y;
    }
  };
  while (index < source.length) {
    const ch = source[index];

    if (ch === '/') {
      const nameMatch = /^\/([A-Za-z0-9_.+-]+)/.exec(source.slice(index, index + 80));
      if (nameMatch !== null) {
        const after = index + nameMatch[0].length;
        const tf = /^\s+[-+]?\d*\.?\d+\s+Tf\b/.exec(source.slice(after, after + 40));
        if (tf !== null) {
          currentFont = fontLookup(nameMatch[1]);
          index = after + tf[0].length;
          continue;
        }
        index = after;
        continue;
      }
    }

    if (ch === '(') {
      const { bytes, end } = readLiteralString(source, index + 1);
      out += decodeWithFont(bytes, currentFont);
      index = end;
      continue;
    }

    if (ch === '<' && source[index + 1] !== '<') {
      const { bytes, end } = readHexString(source, index + 1);
      out += decodeWithFont(bytes, currentFont);
      index = end;
      continue;
    }

    if (ch === '[') {
      const close = source.indexOf(']', index);
      if (close > 0) {
        const inner = source.slice(index + 1, close);
        const parts = inner.split(/(?<=\S)\s+(?=[-(<]|[-+]?\d)/);
        for (const part of parts) {
          if (part.startsWith('(')) out += decodeWithFont(readLiteralString(part, 1).bytes, currentFont);
          else if (part.startsWith('<')) out += decodeWithFont(readHexString(part, 1).bytes, currentFont);
          else if (/[-+]?\d+(?:\.\d+)?/.test(part) && Number.parseFloat(part) < -120) out += ' ';
        }
        index = close + 1;
        continue;
      }
    }

    if (ch === 'T' && (source[index + 1] === 'd' || source[index + 1] === 'D')) {
      // 操作数在操作符之前：往回取紧邻的两个数字（x y）。
      const before = source.slice(Math.max(0, index - 120), index);
      const move = /([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+$/.exec(before);
      if (move !== null) moveTo(Number.parseFloat(move[2]));
      index += 2;
      continue;
    }

    if (ch === 'T' && source[index + 1] === 'm') {
      const before = source.slice(Math.max(0, index - 220), index);
      const matrix = /((?:[-+]?\d*\.?\d+\s+){6})$/.exec(before);
      if (matrix !== null) {
        const numbers = matrix[1].trim().split(/\s+/).map(Number);
        if (numbers.length === 6) moveTo(numbers[5]);
      }
      index += 2;
      continue;
    }

    if ((ch === 'T' && source[index + 1] === '*') || ch === "'" || ch === '"') {
      lineBreak();
      index += ch === 'T' ? 2 : 1;
      continue;
    }

    if (ch === 'B' && source[index + 1] === 'T') { index += 2; continue; }
    if (ch === 'E' && source[index + 1] === 'T') { index += 2; continue; }
    index += 1;
  }
  return out;
}

// -------------------------------------------------------------------- utils

function extractBalanced(source, start) {  let depth = 0;
  let index = start;
  while (index < source.length - 1) {
    if (source[index] === '<' && source[index + 1] === '<') {
      depth += 1;
      index += 2;
      continue;
    }
    if (source[index] === '>' && source[index + 1] === '>') {
      depth -= 1;
      index += 2;
      if (depth === 0) return source.slice(start, index);
      continue;
    }
    index += 1;
  }
  return source.slice(start);
}

export { PdfDocument };

// ------------------------------------------------------------------ PNG 编码

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(raw, width, height, channels) {
  const stride = width * channels;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (stride + 1)] = 0;
    raw.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 3 ? 2 : 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
