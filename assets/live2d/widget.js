/*
 * 大肥鱼 Live2D 组件：CDN、模型配置、菜单、拖拽全部集中在这里。
 * 模板里只需一行引用（见 templates/layout.html 末尾）。
 */
(function () {
  'use strict';

  var current = document.currentScript;
  var MODEL = (current && current.getAttribute('data-model')) ||
              '/live2d/dafeiyu/c_0120.model3.json';
  var CDN = 'https://fastly.jsdelivr.net/npm/oh-my-live2d@0.19.3/dist/index.min.js';
  var STORE_KEY = 'oml2d-drag-offset';

  /* 1) 统一容器：舞台、状态条、菜单、提示框都在里面，只拖这一个元素 */
  var wrapper = document.createElement('div');
  wrapper.id = 'oml2d-wrapper';
  wrapper.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;' +
                          'pointer-events:none;z-index:9999;';
  document.body.appendChild(wrapper);

  var css = document.createElement('style');
  css.textContent = [
    '#oml2d-wrapper > * { pointer-events:auto; }',
    '#oml2d-stage { touch-action:none !important; cursor:grab !important; }',
    '#oml2d-wrapper.is-dragging #oml2d-stage { cursor:grabbing !important; }'
  ].join('');
  document.head.appendChild(css);

  /* 2) 自定义菜单图标（聊天按钮） */
  document.body.insertAdjacentHTML('beforeend',
    '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
    'style="position:absolute;width:0;height:0;overflow:hidden">' +
    '<symbol id="oml2d-icon-chat" viewBox="0 0 24 24">' +
    '<path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>' +
    '</symbol></svg>');

  /* 3) 拖拽：只改 wrapper 的 transform，双击复位，位置记忆 */
  var offset = readOffset();
  var start = null;

  function readOffset() {
    try {
      var v = JSON.parse(localStorage.getItem(STORE_KEY));
      if (v && typeof v.x === 'number' && typeof v.y === 'number') return v;
    } catch (e) {}
    return { x: 0, y: 0 };
  }
  function saveOffset() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(offset)); } catch (e) {}
  }
  function applyOffset() {
    wrapper.style.transform = (offset.x || offset.y)
      ? 'translate(' + offset.x + 'px, ' + offset.y + 'px)'
      : 'none';
  }
  function isDragArea(target) {
    if (target.closest('#oml2d-menus')) return false;
    return !!target.closest('#oml2d-stage, #oml2d-statusBar');
  }

  applyOffset();
  wrapper.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || !isDragArea(e.target)) return;
    start = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    wrapper.classList.add('is-dragging');
  });
  document.addEventListener('pointermove', function (e) {
    if (!start) return;
    offset.x = start.ox + e.clientX - start.x;
    offset.y = start.oy + e.clientY - start.y;
    applyOffset();
  });
  document.addEventListener('pointerup', function () {
    if (!start) return;
    start = null;
    wrapper.classList.remove('is-dragging');
    saveOffset();
  });
  document.addEventListener('pointercancel', function () {
    start = null;
    wrapper.classList.remove('is-dragging');
  });
  wrapper.addEventListener('dblclick', function (e) {
    if (!isDragArea(e.target)) return;
    offset = { x: 0, y: 0 };
    applyOffset();
    try { localStorage.removeItem(STORE_KEY); } catch (err) {}
  });

  /* 4) 组件配置 */
  var options = {
    parentElement: wrapper,
    models: [{
      path: MODEL,
      scale: 0.08,
      position: [-10, 10],
      stageStyle: { width: 320, height: 450 }
    }],
    // 状态条默认相对视口、菜单默认相对舞台，统一成同一个 bottom 才能对齐
    statusBar: {
      style: { bottom: '150px' }
    },
    tips: {
      idleTips: { wordTheDay: true },
      welcomeTips: {
        message: {
          daybreak: '清晨好呀！大肥鱼还在打哈欠~',
          morning: '早上好，今天也要元气满满！',
          noon: '中午啦，记得吃午饭哦！',
          afternoon: '下午摸鱼时间到，来杯咖啡吧！',
          evening: '晚上好，今天过得充实吗？',
          night: '夜深了，注意休息别熬夜啦~'
        }
      }
    },
    menus: {
      style: { bottom: '150px' },
      items: function (defaultItems) {
        return defaultItems
          .filter(function (item) {
            return item.id !== 'SwitchModelClothes' && item.id !== 'SwitchModel';
          })
          .map(function (item) {
            if (item.id === 'Rest') {
              return Object.assign({}, item, { title: '让大肥鱼休息一会' });
            }
            if (item.id === 'About') {
              return Object.assign({}, item, {
                title: '关于本站',
                onClick: function () {
                  window.open('https://github.com/xkk6663/dsh-live2d-mao', '_blank');
                }
              });
            }
            return item;
          })
          .concat([{
            id: 'Chat',
            icon: 'oml2d-icon-chat',
            title: '聊天',
            onClick: function () { /* TODO: 聊天功能待实现 */ }
          }]);
      }
    }
  };

  /* 5) 加载 CDN 并初始化 */
  var script = document.createElement('script');
  script.src = CDN;
  script.onload = function () {
    if (window.OML2D) window.OML2D.loadOml2d(options);
  };
  script.onerror = function () {
    console.warn('[Live2D] CDN 加载失败：' + CDN);
  };
  document.head.appendChild(script);

  /* 6) 「加载成功」提示 3 秒后隐藏；切换到其它文案时自动恢复 */
  (function () {
    var bar = null;
    var timer = null;
    function onText() {
      var text = (bar.textContent || '').trim();
      clearTimeout(timer);
      bar.style.visibility = '';
      bar.style.opacity = '';
      if (text.indexOf('加载成功') !== -1) {
        timer = setTimeout(function () {
          bar.style.visibility = 'hidden';
          bar.style.opacity = '0';
        }, 3000);
      }
    }
    function bind() {
      bar = document.getElementById('oml2d-statusBar');
      if (!bar) return false;
      new MutationObserver(onText).observe(bar, {
        childList: true, subtree: true, characterData: true
      });
      onText();
      return true;
    }
    if (!bind()) {
      var mo = new MutationObserver(function () {
        if (bind()) mo.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  })();
})();
