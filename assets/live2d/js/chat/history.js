/*
 * 会话持久化：对话历史 + 会话 ID，都放在 sessionStorage。
 *
 * - 只存纯文本数组，渲染仍交给 markdown.js，样式与流式输出完全一致；
 * - F5 硬刷新、PJAX 切页、同一标签页里再次进入都能恢复；
 * - 关闭标签页后自动清空，不会把上一次的闲聊带进新会话。
 */

import { sessionStore } from '../util.js';

const VALID_ROLES = ['user', 'bot', 'error'];

export function createHistoryStore({ key, max }) {
  let list = read();

  function read() {
    const parsed = sessionStore.getJSON(key, null);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(function (item) {
        return item && VALID_ROLES.indexOf(item.role) !== -1 &&
               typeof item.text === 'string' && item.text.length > 0;
      })
      .map(function (item) {
        return { role: item.role, text: item.text };
      })
      .slice(-max);
  }

  function save() {
    sessionStore.setJSON(key, list);
  }

  return {
    all() {
      return list;
    },
    push(role, text) {
      if (!text) return;
      list.push({ role: role, text: text });
      if (list.length > max) list = list.slice(-max);
      save();
    },
    /** 覆盖最后一条：用于「流式被 pagehide 抢先存成残稿」的收尾 */
    replaceLast(role, text) {
      if (!list.length) {
        this.push(role, text);
        return;
      }
      list[list.length - 1] = { role: role, text: text };
      save();
    },
    clear() {
      list = [];
      sessionStore.remove(key);
    }
  };
}

function newThreadId() {
  return 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/* 会话 ID：服务端用它去 LangGraph 的检查点里找多轮记忆。
   放在 sessionStorage 里，所以 F5 或 PJAX 切页后仍是同一个会话，
   恢复出来的历史消息也就依然能作为后续对话的上下文。 */
export function createThreadId(key) {
  let current = sessionStore.get(key);

  if (!current) {
    current = newThreadId();
    sessionStore.set(key, current);
  }

  return {
    get() {
      return current;
    },
    /** 换掉 thread_id 是为了让服务端旧上下文不再被复用，否则「清空」只是清了个界面 */
    reset() {
      current = newThreadId();
      sessionStore.set(key, current);
      return current;
    }
  };
}
