/*
 * SSE 客户端：POST 一条消息，边读边把增量回调出去。
 *
 * 只做「网络 + 协议解析」，不认识 DOM。调用方拿到增量后自己决定怎么画。
 * 中断由外部 AbortController 负责，abort 时会抛 AbortError。
 */

const DONE_MARK = '[DONE]';

/* 一帧可能是多行 data:，拼起来再解析 */
function parseFrame(raw) {
  let payload = '';
  raw.split(/\r?\n/).forEach(function (line) {
    if (line.indexOf('data:') === 0) payload += line.slice(5).trim();
  });

  if (!payload || payload === DONE_MARK) return null;

  try {
    return JSON.parse(payload);
  } catch (err) {
    return null;
  }
}

/**
 * @param {object} options
 * @param {string} options.api SSE 接口地址
 * @param {string} options.message 用户输入
 * @param {string} options.threadId 会话 ID
 * @param {AbortSignal} options.signal 中断信号
 * @param {(chunk: string) => void} options.onDelta 增量文本
 * @param {(message: string) => void} options.onError 服务端下发的错误
 */
export async function streamChat({ api, message, threadId, signal, onDelta, onError }) {
  const response = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify({ message: message, thread_id: threadId }),
    signal: signal
  });

  if (!response.ok) throw new Error('HTTP ' + response.status);
  if (!response.body) throw new Error('当前浏览器不支持流式读取');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  function consume(frame) {
    const event = parseFrame(frame);
    if (!event) return;
    if (event.type === 'delta' && event.content) {
      onDelta(event.content);
    } else if (event.type === 'error') {
      onError(event.message || '未知错误');
    }
  }

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;

    buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
    const frames = buffer.split('\n\n');
    buffer = frames.pop();
    frames.forEach(consume);
  }

  if (buffer.trim()) consume(buffer);
}
