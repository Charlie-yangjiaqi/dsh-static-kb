const fs = require('node:fs');

const path = 'lib/runtime.js';
const source = fs.readFileSync(path, 'utf8');
const startMarker = '        // 判断是否需要走视觉：没有文本、文本质量差，或本身就是图片文档。';
const endMarker = '        if (converted === null) {\n          if (text.trim() === \'\') {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker);
if (start < 0 || end < 0) throw new Error('markers not found');

const replacement = `        // 判断是否需要走视觉：没有文本、文本质量差，或本身就是图片文档。
        // 「继续转化」按上次的转化方式续读：视觉文档从下一页开始，文本文档从上次字符偏移继续。
        // 「全量转化」把剩下的页面/文本一次做完：按窗口循环渲染 + 转写，直到最后一页。
        const isContinue = options.continue === true;
        const isFull = options.full === true;
        const continuingVision = (isContinue || isFull) && (doc.conversionMode === 'vision' || (doc.visionPages ?? 0) > 0);
        const existingMarkdown = isContinue || isFull ? (await store.readMarkdown(kbId, docId)).text : '';
        let images = [];
        let startPage = 1;
        let converted = null;
        let mode = 'text';
        let fullVisionPages = null;
        let fullVisionTotal = 0;
        const poorText = text.trim() === '' || (quality !== null && quality < 0.9);

        const visionUsable =
          custom &&
          conversion.vision === true &&
          typeof doc.rawPath === 'string' &&
          (doc.kind === 'pdf' || doc.kind === 'image');

        // 全量：按窗口（最多 20 页/次）循环渲染 + 转写，直到最后一页，内存不会一次性装下整本书。
        if (isFull && visionUsable) {
          const totalPages = doc.kind === 'image' ? 1 : doc.totalPages ?? 0;
          const alreadyPages = continuingVision ? doc.visionPages ?? 0 : 0;
          if (totalPages > alreadyPages) {
            fullVisionTotal = totalPages;
            const parts = [];
            let firstResult = null;
            let page = alreadyPages + 1;
            const windowSize = Math.max(1, Math.min(20, conversion.maxImages || 20));
            while (page <= totalPages) {
              if (job.controller.signal.aborted) {
                throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
              }
              job.progress = { phase: 'images', done: page - 1, total: totalPages };
              const windowImages = await extractDocumentImages({
                store,
                kbId,
                doc,
                maxImages: windowSize,
                startPage: page,
                scale: conversion.rasterScale,
              });
              if (windowImages.length === 0) break;
              images = windowImages;
              job.progress = { phase: 'vision', done: page - 1, total: totalPages };
              const section = await convertWithVision({
                settings: conversion,
                apiKey,
                images: windowImages,
                title: doc.title,
                signal: job.controller.signal,
                continuation: page > 1 || existingMarkdown.trim() !== '',
                concurrency: conversion.concurrency,
                onProgress: (progress) => {
                  job.progress = {
                    phase: 'vision',
                    done: Math.min(totalPages, page - 1 + (Number(progress.done) || 0)),
                    total: totalPages,
                  };
                },
              });
              parts.push(section.content);
              firstResult = firstResult ?? section;
              page += windowImages.length;
            }
            if (parts.length > 0) {
              fullVisionPages = Math.min(totalPages, page - 1);
              const body = \`\${existingMarkdown.trim()}\\n\\n\${parts.join('\\n\\n')}\`.trim();
              converted = {
                title: firstResult?.title ?? doc.title,
                summary: firstResult?.summary ?? doc.summary ?? '',
                tags: firstResult?.tags ?? doc.tags ?? [],
                content: body.startsWith('#') ? body : \`# \${doc.title}\\n\\n\${body}\`,
                chunks: parts.length,
                pages: fullVisionPages,
                mode: 'vision',
                partial: fullVisionPages < totalPages,
              };
              mode = 'vision';
            }
          }
        }

        // 单窗口：首次视觉，或「继续转化」只处理下一批页面。
        if (converted === null) {
          if (continuingVision) {
            if (typeof doc.rawPath !== 'string') {
              throw Object.assign(new Error('该文档没有原始文件，无法继续按页转化'), { code: 'no-source-file' });
            }
            if (!(doc.visionPages > 0) && existingMarkdown.trim() !== '') {
              throw Object.assign(new Error('这篇文档是旧版本转化的，页数记录缺失；请先点「重新转化」'), { code: 'legacy-unknown-progress' });
            }
            startPage = Math.max(1, (doc.visionPages ?? 0) + 1);
            job.progress = { phase: 'images', done: 0, total: 1 };
            images = await extractDocumentImages({
              store,
              kbId,
              doc,
              maxImages: conversion.maxImages,
              startPage,
              scale: conversion.rasterScale,
            });
            if (images.length === 0) {
              throw Object.assign(
                new Error(\`没有可继续转化的页面（已处理 \${doc.visionPages ?? 0} 页\${doc.totalPages ? \` / 共 \${doc.totalPages} 页\` : ''}）\`),
                { code: 'nothing-to-continue' },
              );
            }
          } else if (conversion.vision === true && (poorText || doc.kind === 'image') && typeof doc.rawPath === 'string') {
            job.progress = { phase: 'images', done: 0, total: 1 };
            images = await extractDocumentImages({ store, kbId, doc, maxImages: conversion.maxImages, scale: conversion.rasterScale });
          }

          const canVision = custom && images.length > 0;
          if (canVision && (continuingVision || text.trim() === '' || doc.kind === 'image' || poorText)) {
            try {
              job.progress = { phase: 'vision', done: 0, total: 1 };
              converted = await convertWithVision({
                settings: conversion,
                apiKey,
                images,
                title: doc.title,
                signal: job.controller.signal,
                continuation: continuingVision,
                concurrency: conversion.concurrency,
                onProgress: (progress) => {
                  job.progress = progress;
                },
              });
              mode = 'vision';
            } catch (error) {
              if (text.trim() === '' || continuingVision) throw error;
              // 视觉失败但还有文本：退回文本转化，不中断任务。
              converted = null;
            }
          }
        }

`;

fs.writeFileSync(path, source.slice(0, start) + replacement + source.slice(end), 'utf8');
console.log('rewrote conversion decision block');
