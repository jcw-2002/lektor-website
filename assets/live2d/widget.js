/*
 * 大肥鱼 Live2D 组件入口：只做装配，不写具体逻辑。
 *
 * 模板里只需要一行引用（见 templates/layout.html 末尾），注意是 type="module"：
 *   <script type="module" src="/live2d/widget.js"
 *           data-model="/live2d/dafeiyu/c_0120.model3.json"></script>
 *
 * 模块地图（同为 ESM，按职责分层，互不越界）：
 *   js/config.js         配置解析：data-* 属性 → 只读配置对象
 *   js/util.js           数值收拢 + 存储访问（隐私模式下不抛错）
 *   js/ui/               视觉层：舞台样式、聊天样式、菜单图标
 *   js/widget/stage.js   舞台容器 + 整体拖拽 + 位置记忆
 *   js/widget/options.js oh-my-live2d 的模型/菜单/提示参数
 *   js/widget/loader.js  库加载（本地优先，CDN 回退）
 *   js/widget/gate.js    就绪闸门：初始化期间让 PJAX 暂缓切页（防止打断加载）
 *   js/widget/status.js  状态条：「加载成功」自动隐藏、窄屏点提示唤醒
 *   js/chat/view.js      聊天面板 DOM 与消息渲染
 *   js/chat/layout.js    面板摆放、拖动、缩放
 *   js/chat/markdown.js  极简 Markdown（纯函数）
 *   js/chat/history.js   会话历史与会话 ID 持久化
 *   js/chat/stream.js    SSE 流式请求
 *   js/chat/panel.js     聊天控制器：把上面几个拼起来
 */

import { resolveConfig } from './js/config.js';
import { mountStyles } from './js/ui/styles.js';
import { mountMenuIcons } from './js/ui/icons.js';
import { createStage } from './js/widget/stage.js';
import { buildModelOptions } from './js/widget/options.js';
import { loadOml2dLibrary } from './js/widget/loader.js';
import { createGate } from './js/widget/gate.js';
import { autoHideLoadedTip, clearStaleSleepStatus, createMobileSummon } from './js/widget/status.js';
import { createChatPanel } from './js/chat/panel.js';

function bootstrap() {
  const config = resolveConfig();

  mountStyles(config);
  mountMenuIcons();

  // 舞台与聊天面板刻意都挂在 body 上：PJAX 切页时 body 不重建，它们不会被销毁
  const stage = createStage(config);
  const chat = createChatPanel(config);

  /*
   * 模型初始化期间不允许 PJAX 切页，否则库的加载链会被打断：
   * 它在拿不到 internalModel 的模型上取宽高会抛 TypeError，坏模型还会被挂进 PIXI，
   * 之后每帧报错、看板娘永久崩溃（详见 js/widget/gate.js 顶部注释）。
   * assets/js/pjax.js 从这里取闸门，pending 期间按住站内导航，就绪后再切。
   */
  const gate = createGate(4000);
  window.__oml2dGate = gate;

  let instance = null;
  let retried = false;
  let retryPending = false;
  let navigating = false;
  const mobileMq = window.matchMedia(config.mobile.breakpoint);
  const summon = createMobileSummon({
    mq: mobileMq,
    getInstance: function () {
      return instance;
    },
    afterSummon: stage.applyOffset,
    gate: gate
  });

  autoHideLoadedTip();

  // 必须在库初始化前调用：库会在构造函数里读这个状态
  clearStaleSleepStatus(mobileMq);

  /*
   * 切页期间不动看板娘：
   *   1) 切页会替换 #pjax-container / #pjax-nav，虽然舞台挂在 body 上不受影响，
   *      但此时打断一次模型加载，库的 then 链就会在半初始化的模型上量尺寸而崩；
   *   2) 重试如果正好撞上切页，既会把导航拖住，自己也会被打断。
   * 所以重试推迟到 pjax:complete（成功和失败都会触发）之后再执行。
   */
  document.addEventListener('pjax:send', function () {
    navigating = true;
  });
  document.addEventListener('pjax:complete', function () {
    navigating = false;
    if (retryPending) retryOnce();
  });

  // 模型加载失败后库里那半截 then 会崩，替它重试一次把看板娘救回来
  function retryOnce() {
    if (retried || !instance) return;
    if (navigating) {
      retryPending = true;   // 等这次切页落地再修
      return;
    }
    retried = true;
    retryPending = false;
    gate.close();            // 重试同样在「加载窗口」内，期间不允许切页
    setTimeout(function () {
      let running;
      try {
        running = instance.reloadModel();
      } catch (err) {
        gate.open();
        return;
      }
      Promise.resolve(running).then(function () {
        // 等 reloadModel 内部的挂载/量尺寸跑完再放行
        setTimeout(gate.open, 300);
      }).catch(function () {
        gate.open();
      });
    }, 1500);
  }

  loadOml2dLibrary(config.libSources).then(function (OML2D) {
    if (instance) return;    // 双保险：任何情况下都只创建一个 oml2d 实例

    // 库已经就位，模型开始异步加载：从这里到 onLoad 之间是危险窗口
    if (config.mobile.display || !mobileMq.matches) gate.close();

    instance = OML2D.loadOml2d(buildModelOptions({
      wrapper: stage.element,
      config: config,
      onChatToggle: function () {
        chat.toggle();
      }
    }));

    instance.onLoad(function (status) {
      if (status === 'fail') {
        gate.open();
        retryOnce();
        return;
      }
      if (status === 'success') {
        // 库的 then 链（mount → reloadStyle → resize）和这里是同一轮微任务，
        // 留一点余量再放行，确保切页时舞台尺寸已经定下来
        setTimeout(gate.open, 300);
      }
    });

    summon.start();
    // 舞台有尺寸后，按当前视口收拢一次位置
    setTimeout(stage.applyOffset, 1500);
  }).catch(function (err) {
    gate.open();
    console.warn('[Live2D] 组件初始化失败：' + err.message);
  });
}

/*
 * 同步初始化锁。
 *
 * bootstrap() 在模块求值时同步执行，锁也是在同一次同步调用里落下的：
 * 只要模块被重复执行（页面里重复引入、将来有人把 <script> 搬进 PJAX 替换区、
 * 或者有别的 SPA 式钩子重新执行脚本），第二次会直接返回，
 * 不会出现两个 oml2d 实例 / 两个 PIXI ticker / 两份模型。
 */
if (!window.__oml2dBooted) {
  window.__oml2dBooted = true;
  bootstrap();
}
