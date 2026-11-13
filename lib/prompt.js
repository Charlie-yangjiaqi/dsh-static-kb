// 系统提示词：绑定资料库后注入「资料库优先」规则与目录。
// text 必须是同步函数（宿主在同步路径上取文本），所以只用 apply 阶段预热好的内存快照。
export function registerPrompt({ ctx, runtime }) {
  ctx.systemPrompt.section({
    name: 'knowledge-base',
    order: 55,
    text: (context) => {
      const sessionId = context?.agent?.session?.id ?? context?.session?.id;
      const binding = sessionId === undefined ? null : runtime.bindingOfSync(sessionId);
      if (binding === null) return '';
      const catalog = runtime.catalogOfSync(binding.kbId);
      if (catalog === null) return '';

      const lines = [];
      lines.push(`## 资料库优先（已绑定：${catalog.title}）`);
      lines.push('');
      lines.push('本对话绑定了用户整理的静态资料库。回答规则：');
      lines.push('1. 与资料库主题相关的问题，先用 `kb_search` 检索、用 `kb_read` 读原文；资料库是**主要依据**。');
      lines.push('2. 网络搜索（web_search）与自身知识只作补充；引用资料库内容时在句末标注来源，例如【资料库·实践论】。');
      lines.push('3. 轻微歧义、细节或措辞不一致：**以资料库为准**，无需打断用户，可在回答末尾用一句话说明差异。');
      lines.push('4. 强烈冲突——资料库与可靠来源在关键事实、数字、结论上直接矛盾，且会改变答案：**立即停止作答**，用 `ask_user_question` 说明冲突双方（各引一句原文/来源）并请用户裁决；不得自行取舍、也不得悄悄采信一方。');
      lines.push('5. 资料库没有覆盖、检索不到时，直接说明「资料库中没有相关记载」，再给出资料库之外的补充，并标明是补充。');
      lines.push('');
      lines.push(`资料库目录（可检索 ${catalog.ready} 篇，共 ${catalog.total} 篇）：`);
      if (catalog.lines.length === 0) lines.push('- （暂无可检索文档）');
      else lines.push(...catalog.lines);
      if (catalog.truncated) lines.push('- ……（目录已截断，完整目录见资料库面板）');
      if (catalog.pending > 0) {
        lines.push('');
        lines.push(`另有 ${catalog.pending} 篇资料尚未转化（不可检索）。用户要求时可用 \`kb_pending\` 查看、\`kb_convert\` 转化。`);
      }
      return lines.join('\n');
    },
  });
}
