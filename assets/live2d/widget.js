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
import { autoHideLoadedTip, clearStaleSleepStatus, createMobileSummon } from './js/widget/status.js';
import { createChatPanel } from './js/chat/panel.js';

function bootstrap() {
  const config = resolveConfig();

  mountStyles(config);
  mountMenuIcons();

  // 舞台与聊天面板刻意都挂在 body 上：PJAX 切页时 body 不重建，它们不会被销毁
  const stage = createStage(config);
  const chat = createChatPanel(config);

  let instance = null;
  const mobileMq = window.matchMedia(config.mobile.breakpoint);
  const summon = createMobileSummon({
    mq: mobileMq,
    getInstance: function () {
      return instance;
    },
    afterSummon: stage.applyOffset
  });

  autoHideLoadedTip();

  // 必须在库初始化前调用：库会在构造函数里读这个状态
  clearStaleSleepStatus(mobileMq);

  loadOml2dLibrary(config.libSources).then(function (OML2D) {
    instance = OML2D.loadOml2d(buildModelOptions({
      wrapper: stage.element,
      config: config,
      onChatToggle: function () {
        chat.toggle();
      }
    }));

    summon.start();
    // 舞台有尺寸后，按当前视口收拢一次位置
    setTimeout(stage.applyOffset, 1500);
  }).catch(function (err) {
    console.warn('[Live2D] 组件初始化失败：' + err.message);
  });
}

bootstrap();
