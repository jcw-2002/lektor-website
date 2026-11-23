/*
 * 通用小工具：数值收拢 + 存储访问。
 *
 * 存储一律走这里的封装：Safari 无痕模式、配额用尽、隐私设置都可能让
 * localStorage / sessionStorage 直接抛异常，组件不能因此起不来。
 */

export function clampNum(value, min, max) {
  return max < min ? max : Math.max(min, Math.min(value, max));
}

const resolved = {};

function getStore(name) {
  if (!(name in resolved)) {
    try {
      resolved[name] = window[name + 'Storage'] || null;
    } catch (err) {
      resolved[name] = null;
    }
  }
  return resolved[name];
}

function makeStore(name) {
  return {
    get(key) {
      const store = getStore(name);
      if (!store) return null;
      try {
        return store.getItem(key);
      } catch (err) {
        return null;
      }
    },
    set(key, value) {
      const store = getStore(name);
      if (!store) return;
      try {
        store.setItem(key, value);
      } catch (err) {
        /* 配额用尽 / 无痕模式：忽略，状态只留在内存里 */
      }
    },
    remove(key) {
      const store = getStore(name);
      if (!store) return;
      try {
        store.removeItem(key);
      } catch (err) {
        /* 同上 */
      }
    },
    getJSON(key, fallback) {
      const raw = this.get(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    setJSON(key, value) {
      this.set(key, JSON.stringify(value));
    }
  };
}

/** 长期记忆（拖拽位置、面板尺寸） */
export const localStore = makeStore('local');
/** 单次会话记忆（对话历史、会话 ID、面板展开状态） */
export const sessionStore = makeStore('session');
