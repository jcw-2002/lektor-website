/*
 * 聊天面板视图层：建 DOM、画消息、维护流式气泡。
 *
 * 这一层只管「长什么样」，不知道请求、历史、焦点，也不写存储。
 * 面板挂在 body 上（不在 #oml2d-wrapper 内），拖动模型时不会带着它一起动。
 */

import { cleanText, mdToHtml } from './markdown.js';

const PANEL_HTML =
  '<div id="oml2d-chat-head">' +
    '<span class="oml2d-chat-avatar">🐳</span>' +
    '<span class="oml2d-chat-title">大肥鱼</span>' +
    '<button type="button" id="oml2d-chat-clear" aria-label="清空对话" ' +
      'title="清空对话记录（同时重置会话上下文）">清空</button>' +
    '<button type="button" id="oml2d-chat-close" aria-label="关闭聊天">✕</button>' +
  '</div>' +
  '<div id="oml2d-chat-log"></div>' +
  '<form id="oml2d-chat-form">' +
    '<textarea id="oml2d-chat-input" rows="1" maxlength="2000" ' +
      'placeholder="问问博客或技术的问题～"></textarea>' +
    '<button type="submit" id="oml2d-chat-send">发送</button>' +
  '</form>' +
  '<div class="oml2d-chat-resize oml2d-resize-e" data-dir="e"></div>' +
  '<div class="oml2d-chat-resize oml2d-resize-s" data-dir="s"></div>' +
  '<div class="oml2d-chat-resize oml2d-resize-se" data-dir="se"></div>';

const IDLE_PLACEHOLDER = '问问博客或技术的问题～';
const BUSY_PLACEHOLDER = '大肥鱼正在思考…（点“停止”可打断）';

export function createChatView() {
  const panel = document.createElement('div');
  panel.id = 'oml2d-chat';
  panel.innerHTML = PANEL_HTML;
  document.body.appendChild(panel);

  const refs = {
    head: panel.querySelector('#oml2d-chat-head'),
    log: panel.querySelector('#oml2d-chat-log'),
    form: panel.querySelector('#oml2d-chat-form'),
    input: panel.querySelector('#oml2d-chat-input'),
    send: panel.querySelector('#oml2d-chat-send'),
    close: panel.querySelector('#oml2d-chat-close'),
    clear: panel.querySelector('#oml2d-chat-clear')
  };

  /* 每帧最多重绘一次，避免每个 token 都重新跑一遍 Markdown */
  let paintFrame = null;
  let pending = null;

  function scrollToBottom() {
    refs.log.scrollTop = refs.log.scrollHeight;
  }

  function paintBubble(msg) {
    try {
      const html = mdToHtml(cleanText(msg.raw));
      // 首帧还没有内容时留一个空段落，好让流式光标有落脚点
      msg.content.innerHTML = html || '<p></p>';
    } catch (err) {
      msg.content.textContent = cleanText(msg.raw);
    }
  }

  function schedulePaint(msg) {
    pending = msg;
    if (paintFrame) return;
    paintFrame = requestAnimationFrame(function () {
      paintFrame = null;
      const target = pending;
      pending = null;
      if (target) paintBubble(target);
      scrollToBottom();
    });
  }

  /* 收尾：丢掉未执行的帧，立刻按最终文本渲染一次 */
  function finishPaint(msg) {
    if (paintFrame) {
      cancelAnimationFrame(paintFrame);
      paintFrame = null;
    }
    pending = null;
    paintBubble(msg);
  }

  /** 普通消息：user 走纯文本，bot/error 走 Markdown */
  function appendMessage(role, text) {
    const el = document.createElement('div');
    el.className = 'oml2d-msg ' + (role === 'user' ? 'user' : role === 'error' ? 'error' : 'bot');

    if (role === 'user') {
      el.textContent = text;
    } else {
      const content = document.createElement('div');
      content.className = 'oml2d-md';
      content.innerHTML = mdToHtml(cleanText(text));
      el.appendChild(content);
    }

    refs.log.appendChild(el);
    scrollToBottom();
    return el;
  }

  /** 流式气泡：调用方持续往 raw 里追加，再 schedulePaint */
  function addStreamBubble() {
    const el = document.createElement('div');
    el.className = 'oml2d-msg bot is-stream';
    const content = document.createElement('div');
    content.className = 'oml2d-md';
    el.appendChild(content);
    refs.log.appendChild(el);
    scrollToBottom();
    return { el: el, content: content, raw: '' };
  }

  function clear() {
    refs.log.innerHTML = '';
  }

  function setBusy(state) {
    refs.send.textContent = state ? '停止' : '发送';
    refs.input.placeholder = state ? BUSY_PLACEHOLDER : IDLE_PLACEHOLDER;
  }

  return {
    panel,
    refs,
    appendMessage,
    addStreamBubble,
    schedulePaint,
    finishPaint,
    scrollToBottom,
    clear,
    setBusy
  };
}
