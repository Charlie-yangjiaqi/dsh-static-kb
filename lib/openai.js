// 最小 OpenAI 兼容客户端：用于「单独配置 API Key」的转化模型（文本 + 视觉）。
// 只依赖 fetch；不读 DSH 凭据，Key 由调用方传入。

export function normalizeBaseURL(baseURL) {
  const value = String(baseURL ?? '').trim().replace(/\/+$/, '');
  if (value === '') return '';
  if (!/^https?:\/\//i.test(value)) return '';
  return value;
}

function joinURL(baseURL, path) {
  const base = normalizeBaseURL(baseURL);
  if (base === '') throw new Error('未配置转换服务地址（baseURL）');
  return `${base}/${path.replace(/^\/+/, '')}`;
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * 调用 OpenAI 兼容的 /chat/completions。
 * @returns {Promise<string>}
 */
export async function chatCompletion({
  baseURL,
  apiKey,
  model,
  messages,
  system,
  maxTokens = 8192,
  temperature = 0.2,
  timeoutMs = 300000,
  signal,
}) {
  if (!model) throw new Error('未配置转换模型（model）');
  if (!apiKey) throw new Error('未配置转换 API Key');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal !== undefined && signal !== null) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const payloadMessages = typeof system === 'string' && system !== '' ? [{ role: 'system', content: system }, ...messages] : messages;
    const response = await fetch(joinURL(baseURL, 'chat/completions'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        // OpenCode Go 网关要求稳定的会话 ID，缺失会返回 400 MissingSessionID
        'x-opencode-session': process.env.DSH_KB_OPENCODE_SESSION || `dsh-static-kb-${process.pid}`,
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`转换模型请求失败（HTTP ${response.status}）：${text.slice(0, 300)}`);
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`转换模型返回非 JSON：${text.slice(0, 200)}`);
    }
    const message = payload?.choices?.[0]?.message;
    const content = contentToText(message?.content);
    if (content.trim() === '') {
      const reasoning = typeof message?.reasoning_content === 'string' ? message.reasoning_content.length : 0;
      throw new Error(`转换模型返回空内容${reasoning > 0 ? `（推理 ${reasoning} 字符）` : ''}`);
    }
    return content;
  } catch (error) {
    if (error?.name === 'AbortError') {
      // 外部 signal 取消 → aborted（上层按「已取消」处理，不写失败原因）；否则算超时。
      if (signal !== undefined && signal !== null && signal.aborted) {
        throw Object.assign(new Error('转换已取消'), { code: 'aborted' });
      }
      throw new Error('转换模型请求超时（可调小「视觉最多读取页数」或换更快的模型）');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal !== undefined && signal !== null) signal.removeEventListener('abort', onAbort);
  }
}

/** 视觉消息：把图片按 OpenAI 的 image_url data: 形式塞进 user 消息。 */
export function visionMessages(prompt, images) {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...images.map((image) => ({
          type: 'image_url',
          image_url: { url: `data:${image.mime};base64,${image.data.toString('base64')}` },
        })),
      ],
    },
  ];
}
