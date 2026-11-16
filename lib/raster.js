// PDF 页面栅格化：把整页渲染成 PNG，供扫描件 / 无文本层 PDF 走视觉转化。
// 依赖 pdf-to-png-converter（内部 pdfjs-dist + @napi-rs/canvas），纯 JS，不需要外部二进制，
// 可选依赖缺失时返回空数组，调用方退回内嵌图片抽取。

let cachedRenderer;

async function loadRenderer() {
  if (cachedRenderer !== undefined) return cachedRenderer;
  try {
    const mod = await import('pdf-to-png-converter');
    const fn = mod.pdfToPng ?? mod.default?.pdfToPng;
    cachedRenderer = typeof fn === 'function' ? fn : null;
  } catch {
    cachedRenderer = null;
  }
  return cachedRenderer;
}

/**
 * 逐页渲染 PDF 为 PNG。
 * @param {Buffer} buffer PDF 字节
 * @param {{ startPage?: number, maxPages?: number, scale?: number }} options
 *        startPage 从 1 开始；用于「继续转化」时从已处理的下一页接着渲染。
 * @returns {Promise<Array<{mime:string,data:Buffer,width:number,height:number,page:number}>>}
 */
export async function renderPdfPages(buffer, { startPage = 1, maxPages = 8, scale = 2 } = {}) {
  const pdfToPng = await loadRenderer();
  if (pdfToPng === null) return [];
  const first = Math.max(1, Math.trunc(startPage) || 1);
  const limit = Math.max(1, Math.min(40, Math.trunc(maxPages) || 1));
  const viewportScale = Math.min(4, Math.max(1, Number(scale) || 2));
  const pagesToProcess = Array.from({ length: limit }, (_, index) => first + index);
  try {
    const pages = await pdfToPng(buffer, { pagesToProcess, viewportScale, returnPageContent: true });
    return pages
      .filter((page) => page?.content !== undefined && page.content !== null)
      .map((page, index) => ({
        mime: 'image/png',
        data: page.content,
        width: page.width ?? 0,
        height: page.height ?? 0,
        page: Number.isFinite(page.pageNumber) ? page.pageNumber : first + index,
      }));
  } catch {
    return [];
  }
}

export function hasRasterizer() {
  return loadRenderer().then((renderer) => renderer !== null);
}

let cachedPdfjs;

async function loadPdfjs() {
  if (cachedPdfjs !== undefined) return cachedPdfjs;
  try {
    cachedPdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    cachedPdfjs = null;
  }
  return cachedPdfjs;
}

/**
 * 用 pdf.js 读页数：加密 PDF（空密码）与对象流里藏页树的文件，自研解析器读不出来，
 * 但 pdf.js 能打开，视觉转化也是用它渲染的。
 */
export async function pdfPageCountRaster(buffer) {
  const pdfjs = await loadPdfjs();
  if (pdfjs === null || typeof pdfjs.getDocument !== 'function') return 0;
  let document = null;
  try {
    document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: false,
      isEvalSupported: false,
    }).promise;
    return Number(document.numPages) || 0;
  } catch {
    return 0;
  } finally {
    if (document !== null) {
      try {
        await document.destroy();
      } catch {
        /* 清理失败不影响结果 */
      }
    }
  }
}
