/*
 * 状态条的两个小功能：
 *   1) 「加载成功」提示 3 秒后自动隐藏，切换到其它文案时自动恢复；
 *   2) 窄屏默认休息，把「看板娘休息中」改造成可点击的唤醒入口。
 *
 * 关于唤醒为什么不能依赖库的 statusBar.setClickEvent：
 *   - 它内部只是 `element.onclick = fn`，谁后写谁生效；
 *   - 库在舞台滑出时会自己执行 `statusBar.open(restMessage)` 并重绑 onclick，
 *     那个内置处理器只做 `stage.slideIn() → statusBar.close() → clearClickEvent()`，
 *     不会 reloadModel。而 `stage.slideOut()` 在每次 reloadModel（含旋屏、地址栏
 *     收起触发的窗口 resize）里都会跑一遍。
 *   - 结果就是：点「唤醒看板娘」时执行的是库的处理器 —— 模型不动（仍走 mobileHidden），
 *     提示被关掉、点击事件被清空，只能刷新页面。
 *
 * 所以这里改成：点击用捕获阶段自己拦（库的 onclick 永远收不到事件），
 * 文案用 MutationObserver 盯着，被库改回「看板娘休息中」就重新贴回提示。
 */

const HIDDEN_DELAY = 3000;
const MOBILE_HINT = '点我唤醒看板娘';
/* 首次绑定（状态条可能还没创建）与提示重贴的时间点 */
const HINT_RETRY = [0, 600, 1200, 2400, 3600];
/* 库自己的加载/失败文案不要抢，交给库和它的重试逻辑 */
const BUSY_TEXT_RE = /(加载|失败|重试)/;

/** 「加载成功」自动淡出：等 statusBar 出现后再挂 MutationObserver */
export function autoHideLoadedTip() {
  let bar = null;
  let timer = null;

  function onTextChange() {
    const text = (bar.textContent || '').trim();
    clearTimeout(timer);
    bar.style.visibility = '';
    bar.style.opacity = '';
    if (text.indexOf('加载成功') === -1) return;
    timer = setTimeout(function () {
      bar.style.visibility = 'hidden';
      bar.style.opacity = '0';
    }, HIDDEN_DELAY);
  }

  function bind() {
    bar = document.getElementById('oml2d-statusBar');
    if (!bar) return false;
    new MutationObserver(onTextChange).observe(bar, {
      childList: true, subtree: true, characterData: true
    });
    onTextChange();
    return true;
  }

  if (bind()) return;

  const waiting = new MutationObserver(function () {
    if (bind()) waiting.disconnect();
  });
  waiting.observe(document.body, { childList: true, subtree: true });
}

/*
 * 库会把「休息」状态写进 localStorage.OML2D_STATUS（魔数 'sleep'），下次初始化时
 * 读到它就走进一条「只滑入舞台、不加载模型」的分支，顺便把 statusBar 的 onclick
 * 换成它自己的（只滑舞台、关提示、清事件）。点过菜单里的「休息」之后这个状态会
 * 一直留在 localStorage 里，于是窄屏上「点唤醒没反应、提示消失」就出现了。
 *
 * 窄屏下唤醒由我们接管，初始化前把它清掉，避免库装那一套 handler。
 * 必须在 loadOml2d 之前调用（构造函数里就会读这个值）。
 */
export function clearStaleSleepStatus(mq) {
  if (!mq || !mq.matches) return;
  try {
    localStorage.removeItem('OML2D_STATUS');
  } catch (err) {
    /* 隐私模式下读不到存储，忽略 */
  }
}

/**
 * 窄屏唤醒入口。
 * @param {object} options
 * @param {MediaQueryList} options.mq 窄屏判定
 * @param {() => object|null} options.getInstance 当前 oml2d 实例
 * @param {() => void} options.afterSummon 模型就绪后的收尾（收拢拖拽位置）
 * @param {object} [options.gate] 就绪闸门：唤醒期间按住站内导航（同初始化期护栏）
 */
export function createMobileSummon({ mq, getInstance, afterSummon, gate }) {
  let summoned = false;      // 模型已经唤出，后续点击不再打扰
  let attempting = false;    // 正在加载，避免连点重入
  let bound = false;
  let observer = null;

  function getBar() {
    const instance = getInstance();
    const bar = instance && instance.statusBar;
    return bar && bar.element ? bar : null;
  }

  function barText(bar) {
    return ((bar.element && bar.element.textContent) || '').trim();
  }

  function showHint(bar) {
    if (summoned || attempting) return;
    if (!bar || typeof bar.popup !== 'function') return;
    bar.popup(MOBILE_HINT, false);   // duration=false：不自动隐藏
  }

  /* 库每次滑出舞台都会把文案换成「看板娘休息中」（并重绑它自己的 onclick），
     这里盯住文案，一变回去就重新贴回可点击的提示 */
  function watchBar(bar) {
    if (typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function () {
      if (summoned || attempting) return;
      const text = barText(bar);
      if (!text || text === MOBILE_HINT || BUSY_TEXT_RE.test(text)) return;
      showHint(bar);
    });
    observer.observe(bar.element, { childList: true, subtree: true, characterData: true });
  }

  /* 状态条、实例都是异步就位的，这里在几个时间点补绑 + 补提示 */
  function ensure() {
    if (summoned || !mq.matches) return;

    const bar = getBar();
    if (!bar) return;

    if (!bound) {
      bound = true;
      watchBar(bar);
    }
    if (attempting || barText(bar) === MOBILE_HINT) return;
    showHint(bar);
  }

  function start() {
    HINT_RETRY.forEach(function (delay) {
      setTimeout(ensure, delay);
    });
  }

  /* 模型是真加载出来了，还是库在「加载失败」之后就悄悄收场了 */
  function isLoaded(instance, bar) {
    const options = instance.options || {};
    const failText = (options.statusBar && options.statusBar.loadFailMessage) || '加载失败';
    const text = bar ? barText(bar) : '';
    if (text.indexOf(failText) !== -1) return false;

    try {
      const models = instance.models;
      if (models && 'model' in models && !models.model) return false;
    } catch (err) {
      /* 库里内部结构变了就按成功处理，别把能用的功能判死 */
    }
    return true;
  }

  async function summon() {
    const instance = getInstance();
    if (!instance || summoned || attempting) return;

    const bar = getBar();
    attempting = true;
    // 加载期间别让 PJAX 切页：打断库的初始化链会让看板娘崩掉（见 gate.js）
    if (gate) gate.close();

    try {
      // 运行时长开 mobileDisplay，绕开创建时就定下来的 mobileHidden
      instance.options.mobileDisplay = true;
      if (bar && typeof bar.clearClickEvent === 'function') bar.clearClickEvent();
      await instance.reloadModel();

      if (!isLoaded(instance, getBar())) throw new Error('模型没有加载出来');
    } catch (err) {
      console.warn('[Live2D] 唤醒看板娘失败：', err);
      attempting = false;
      // 回滚成「休息」状态，提示重新贴回来，用户可以再点一次
      try {
        instance.options.mobileDisplay = false;
      } catch (e) {
        /* 忽略 */
      }
      const current = getBar();
      if (current) {
        if (typeof current.clearClickEvent === 'function') current.clearClickEvent();
        showHint(current);
      }
      return;
    } finally {
      // 加载窗口结束（成功或失败）都要放行导航
      if (gate) gate.open();
    }

    attempting = false;
    summoned = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const current = getBar();
    if (current && typeof current.clearClickEvent === 'function') current.clearClickEvent();
    // 舞台尺寸就绪后再收拢一次旧位置，避免上次拖到屏幕外的 offset 继续生效
    setTimeout(afterSummon, 1500);
  }

  /* 捕获阶段拦住点击：库的 onclick 绑在元素本身，事件到不了它那里。
     加载中也要拦（只吞事件不重复触发），否则库残留的 handler 会把提示关掉。 */
  document.addEventListener('click', function (event) {
    if (summoned || !mq.matches) return;
    const bar = getBar();
    if (!bar || !bar.element.contains(event.target)) return;
    if (!barText(bar)) return;

    event.preventDefault();
    event.stopPropagation();
    if (attempting) return;
    summon();
  }, true);

  // 从宽屏缩到窄屏（旋屏/改窗口）时，补一次绑定与提示
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', function () {
      if (mq.matches) start();
    });
  }

  return { start, summon };
}
