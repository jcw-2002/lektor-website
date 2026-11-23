/*
 * 聊天面板控制器：把视图、布局、历史、SSE 串起来。
 *
 * 对外只暴露「开关」；面板自己的 DOM、事件、状态全部内部消化。
 */

import { sessionStore } from '../util.js';
import { createChatView } from './view.js';
import { createPanelLayout } from './layout.js';
import { createHistoryStore, createThreadId } from './history.js';
import { streamChat } from './stream.js';

const TRUNCATED_NOTE = '\n\n[页面已关闭，回复被截断]';
const EMPTY_REPLY = '（大肥鱼这次没说话，再问一次试试～）';
const INPUT_BASE_HEIGHT = '38px';
const INPUT_MAX_HEIGHT = 110;

export function createChatPanel(config) {
  const view = createChatView();
  const layout = createPanelLayout({
    panel: view.panel,
    head: view.refs.head,
    sizeKey: config.keys.panelSize
  });
  const history = createHistoryStore({
    key: config.keys.history,
    max: config.chat.maxHistory
  });
  const thread = createThreadId(config.keys.thread);

  let open = false;
  let busy = false;
  let abortController = null;
  let activeStream = null;   // 正在输出的气泡，页面被关闭时用来抢救半截回复

  function focusInput() {
    view.refs.input.focus();
  }

  function setBusy(state) {
    busy = state;
    view.setBusy(state);
    if (!state && open) focusInput();
  }

  /** 渲染并落盘 */
  function addMessage(role, text) {
    view.appendMessage(role, text);
    history.push(role, text);
  }

  function toggle(forceOpen) {
    open = typeof forceOpen === 'boolean' ? forceOpen : !open;
    sessionStore.set(config.keys.open, open ? '1' : '0');   // 展开/收起状态也持久化
    view.panel.classList.toggle('is-open', open);
    if (open) {
      layout.place();
      focusInput();
    }
  }

  /* 清空对话：历史、面板、会话 ID 一起重置。
     换掉 thread_id 是为了让服务端 MemorySaver 里的旧上下文不再被复用，
     否则「清空」只是清了个界面。 */
  function clear() {
    if (busy && abortController) abortController.abort();
    history.clear();
    thread.reset();
    activeStream = null;
    view.clear();
    addMessage('bot', config.chat.greeting);
    if (open) focusInput();
  }

  async function send(text) {
    addMessage('user', text);          // 用户消息立即落盘
    const msg = view.addStreamBubble();
    activeStream = msg;

    const controller = new AbortController();
    abortController = controller;
    setBusy(true);

    try {
      await streamChat({
        api: config.chatApi,
        message: text,
        threadId: thread.get(),
        signal: controller.signal,
        onDelta: function (chunk) {
          msg.raw += chunk;
          view.schedulePaint(msg);
        },
        onError: function (message) {
          msg.el.classList.add('error');
          msg.raw += '\n\n[出错了] ' + message;
          view.schedulePaint(msg);
        }
      });
      if (!msg.raw.trim()) msg.raw = EMPTY_REPLY;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        msg.raw += '\n\n[已停止]';
      } else {
        msg.el.classList.add('error');
        msg.raw += '\n\n[连接失败] ' + (err && err.message ? err.message : err);
      }
    } finally {
      view.finishPaint(msg);
      msg.el.classList.remove('is-stream');
      abortController = null;
      setBusy(false);
      view.scrollToBottom();
      if (activeStream === msg) activeStream = null;

      // 流式结束（正常/出错/被打断）才落盘：避免每个 token 都写一次 sessionStorage
      const role = msg.el.classList.contains('error') ? 'error' : 'bot';
      if (msg.flushed) {
        // 这轮回复已被 pagehide 抢先存成残稿，就地覆盖，避免历史里出现两条
        history.replaceLast(role, msg.raw);
      } else {
        history.push(role, msg.raw);
      }
    }
  }

  /* 流式输出还没结束就刷新/关页面时，把已生成的部分存下来，避免整段回复丢失 */
  window.addEventListener('pagehide', function () {
    const msg = activeStream;
    if (!msg || !msg.raw || !msg.raw.trim()) return;
    const role = msg.el.classList.contains('error') ? 'error' : 'bot';
    const text = msg.raw + TRUNCATED_NOTE;
    if (msg.flushed) {
      // 从 bfcache 回来又被打断：覆盖上一次的残稿，不要堆两条
      history.replaceLast(role, text);
    } else {
      history.push(role, text);
      msg.flushed = true;
    }
  });

  /* ---------- 事件绑定 ---------- */

  view.refs.close.addEventListener('click', function () {
    toggle(false);
  });

  view.refs.clear.addEventListener('click', clear);

  view.refs.input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      const form = view.refs.form;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  view.refs.input.addEventListener('input', function () {
    const input = view.refs.input;
    input.style.height = INPUT_BASE_HEIGHT;
    input.style.height = Math.min(input.scrollHeight, INPUT_MAX_HEIGHT) + 'px';
  });

  view.refs.form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (busy) {
      if (abortController) abortController.abort();
      return;
    }
    const input = view.refs.input;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = INPUT_BASE_HEIGHT;
    send(text);
  });

  // 面板可能比模型先就位，窗口尺寸变化/资源就绪后重新贴一次
  window.addEventListener('resize', function () {
    if (open) layout.place();
  });
  window.addEventListener('load', function () {
    if (open) layout.place();
  });

  /* ---------- 首次进入 ---------- */

  // 优先恢复 sessionStorage 里的历史，没有才播欢迎语；恢复时不抢焦点
  const restored = history.all().slice();
  if (restored.length) {
    restored.forEach(function (item) {
      view.appendMessage(item.role, item.text);
    });
  } else {
    addMessage('bot', config.chat.greeting);
  }

  if (sessionStore.get(config.keys.open) === '1') {
    open = true;
    view.panel.classList.add('is-open');
    layout.place();
  }

  return {
    element: view.panel,
    toggle,
    isOpen: function () {
      return open;
    }
  };
}
