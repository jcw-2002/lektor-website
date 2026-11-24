/*
 * Live2D 就绪闸门。
 *
 * 为什么需要：oh-my-live2d 的加载链是
 *     models.create().catch(报加载失败).then(挂载模型 + 读取 modelSize)
 * catch 之后没有 return，所以「模型没加载出来」时 then 仍然会跑：
 * 它会在一个 internalModel 还没赋值的 Live2DModel 上取宽高，抛 TypeError，
 * 并把半成品模型挂进 PIXI —— 之后渲染循环每帧报 TypeError，看板娘永久崩溃。
 *
 * 而模型加载被打断（例如这段时间里 PJAX 把页面切走）正好会让 create() 失败。
 * 于是这里把「模型正在加载」这段窗口期暴露出去：assets/js/pjax.js 是普通脚本，
 * 通过 window.__oml2dGate 拿到这个闸门，在 pending 期间按住站内导航，等模型挂好再切页。
 *
 * 安全兜底：pending 一定会在「就绪 / 失败 / 超时」时结束，导航不会被卡死。
 */

const DEFAULT_TIMEOUT = 4000;

/**
 * @param {number} timeout 最长按住多久（毫秒），兜底防止库异常时导航一直卡着
 */
export function createGate(timeout) {
  let timer = 0;
  let resolvePending = null;
  let pendingPromise = Promise.resolve();

  const gate = {
    /* 有新导航在等闸门？pjax.js 只认这个标记 */
    get pending() {
      return !!resolvePending;
    },

    /* 放行前先 then 到这里：拿到的一定是「闸门打开」那一刻 */
    get promise() {
      return pendingPromise;
    },

    /* 进入加载窗口：开始按住站内导航 */
    close() {
      if (resolvePending) return;
      pendingPromise = new Promise(function (resolve) {
        resolvePending = resolve;
      });
      timer = setTimeout(gate.open, timeout || DEFAULT_TIMEOUT);
    },

    /* 加载结束（成功 / 失败 / 超时）：放行 */
    open() {
      clearTimeout(timer);
      timer = 0;
      const resolve = resolvePending;
      resolvePending = null;
      if (resolve) resolve();
    }
  };

  return gate;
}
