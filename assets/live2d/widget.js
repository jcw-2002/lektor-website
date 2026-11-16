/*
 * 大肥鱼 Live2D 组件：库加载、模型配置、菜单、拖拽、AI 聊天全部集中在这里。
 * 模板里只需一行引用（见 templates/layout.html 末尾）。
 */
(function () {
  'use strict';

  var current = document.currentScript;
  var MODEL = (current && current.getAttribute('data-model')) ||
              '/live2d/dafeiyu/c_0120.model3.json';
  // SSE 接口地址：可用 <script data-chat-api="..."> 覆盖，默认走同源 /api/chat
  var CHAT_API = (current && current.getAttribute('data-chat-api')) || '/api/chat';
  // oh-my-live2d 加载源：优先本地托管（已随 assets 部署），失败再回退 CDN
  var OML2D_SOURCES = [
    '/live2d/oml2d.min.js',
    'https://unpkg.com/oh-my-live2d@0.19.3/dist/index.min.js'
  ];
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
    '#oml2d-wrapper.is-dragging #oml2d-stage { cursor:grabbing !important; }',

    /* ===== 大肥鱼聊天面板：单色极简，挂在 body 上，可单独拖动 ===== */
    '#oml2d-chat { position:fixed; left:0; top:0; width:320px; height:420px;',
    '  display:none; flex-direction:column; overflow:hidden; border-radius:8px;',
    '  background:#fff; border:1px solid #e6e6e6; z-index:10000;',
    '  box-shadow:0 4px 14px rgba(0,0,0,.07);',
    '  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; font-size:14px; color:#333; }',
    '#oml2d-chat.is-open { display:flex; }',
    '#oml2d-chat-head { display:flex; align-items:center; gap:8px; padding:10px 12px;',
    '  background:#fafafa; border-bottom:1px solid #eee; color:#1f1f1f;',
    '  cursor:grab; user-select:none; touch-action:none; }',
    '#oml2d-chat.is-dragging #oml2d-chat-head { cursor:grabbing; }',
    '.oml2d-chat-avatar { font-size:16px; line-height:1; }',
    '.oml2d-chat-title { font-size:13px; font-weight:600; }',
    '#oml2d-chat-close { margin-left:auto; border:0; background:transparent;',
    '  color:#999; cursor:pointer; font-size:13px; line-height:1;',
    '  width:22px; height:22px; border-radius:4px;',
    '  display:flex; align-items:center; justify-content:center; }',
    '#oml2d-chat-close:hover { background:#f0f0f0; color:#333; }',
    '#oml2d-chat-log { flex:1; min-height:0; overflow-y:auto; padding:12px;',
    '  display:flex; flex-direction:column; gap:8px;',
    '  scrollbar-width:thin; scrollbar-color:#d4d4d4 transparent; }',
    '#oml2d-chat-log::-webkit-scrollbar { width:5px; }',
    '#oml2d-chat-log::-webkit-scrollbar-thumb { background:#d4d4d4; border-radius:3px; }',
    '#oml2d-chat-log::-webkit-scrollbar-track { background:transparent; }',
    '.oml2d-msg { max-width:84%; padding:8px 11px; border-radius:8px; white-space:pre-wrap;',
    '  word-break:break-word; font-size:13px; line-height:1.6; }',
    '.oml2d-msg.user { align-self:flex-end; background:#1f1f1f; color:#fff; }',
    '.oml2d-msg.bot { align-self:flex-start; background:#f4f4f4; color:#333; }',
    '.oml2d-msg.error { background:#fff; color:#333; border:1px solid #d4d4d4; }',
    '.oml2d-caret { display:inline-block; width:6px; height:12px; margin-left:2px;',
    '  vertical-align:-2px; background:#a3a3a3; }',
    '#oml2d-chat-form { display:flex; gap:8px; padding:10px;',
    '  border-top:1px solid #eee; background:#fff; }',
    '#oml2d-chat-input { flex:1; min-width:0; resize:none; height:36px; padding:8px 10px;',
    '  border:1px solid #dcdcdc; border-radius:6px; outline:none;',
    '  background:#fff; color:#333;',
    '  font-family:inherit; font-size:13px; line-height:1.4; }',
    '#oml2d-chat-input:focus { border-color:#1f1f1f; }',
    '#oml2d-chat-input::placeholder { color:#a3a3a3; }',
    '#oml2d-chat-send { flex:0 0 56px; border:0; border-radius:6px; cursor:pointer;',
    '  background:#1f1f1f; color:#fff; font-family:inherit; font-size:13px; font-weight:500; }',
    '#oml2d-chat-send:hover:not(:disabled) { background:#3d3d3d; }',
    '#oml2d-chat-send:disabled { opacity:.45; cursor:not-allowed; }',
    '@media (max-width:720px) { #oml2d-chat { border-radius:6px; } }'
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

  /* 4) 大肥鱼 AI 聊天：SSE 流式输出 + 紧贴 Live2D 的对话气泡 */
  var THREAD_KEY = 'whale-agent-thread-id';
  var THREAD_ID = (function () {
    var id = null;
    try { id = sessionStorage.getItem(THREAD_KEY); } catch (e) {}
    if (!id) {
      id = 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      try { sessionStorage.setItem(THREAD_KEY, id); } catch (e) {}
    }
    return id;
  })();

  var chatOpen = false;
  var busy = false;
  var abortController = null;

  var panel = document.createElement('div');
  panel.id = 'oml2d-chat';
  panel.innerHTML =
    '<div id="oml2d-chat-head">' +
      '<span class="oml2d-chat-avatar">🐳</span>' +
      '<span class="oml2d-chat-title">大肥鱼</span>' +
      '<button type="button" id="oml2d-chat-close" aria-label="关闭聊天">✕</button>' +
    '</div>' +
    '<div id="oml2d-chat-log"></div>' +
    '<form id="oml2d-chat-form">' +
      '<textarea id="oml2d-chat-input" rows="1" maxlength="2000" ' +
        'placeholder="问问博客或技术的问题～"></textarea>' +
      '<button type="submit" id="oml2d-chat-send">发送</button>' +
    '</form>';
  // 面板挂在 body 上（不在 wrapper 内），拖动模型时不会带着它一起动
  document.body.appendChild(panel);

  var log = panel.querySelector('#oml2d-chat-log');
  var form = panel.querySelector('#oml2d-chat-form');
  var input = panel.querySelector('#oml2d-chat-input');
  var sendBtn = panel.querySelector('#oml2d-chat-send');

  function scrollLog() { log.scrollTop = log.scrollHeight; }

  function addMessage(role, text) {
    var el = document.createElement('div');
    el.className = 'oml2d-msg ' + (role === 'user' ? 'user' : role === 'error' ? 'error' : 'bot');
    el.textContent = text;
    log.appendChild(el);
    scrollLog();
    return el;
  }

  function addStreamBubble() {
    var el = document.createElement('div');
    el.className = 'oml2d-msg bot';
    var body = document.createTextNode('');
    var caret = document.createElement('span');
    caret.className = 'oml2d-caret';
    el.appendChild(body);
    el.appendChild(caret);
    log.appendChild(el);
    scrollLog();
    return { el: el, body: body, caret: caret };
  }

  function setBusy(state) {
    busy = state;
    sendBtn.textContent = state ? '停止' : '发送';
    input.placeholder = state
      ? '大肥鱼正在思考…（点“停止”可打断）'
      : '问问博客或技术的问题～';
    if (!state && chatOpen) input.focus();
  }

  var PANEL_W = 320;
  var PANEL_H = 420;

  function clampNum(v, min, max) {
    return max < min ? max : Math.max(min, Math.min(v, max));
  }

  /* 依据模型舞台的位置把面板贴到旁边（面板固定在 body 上，坐标即视口坐标） */
  function positionChatUi() {
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var margin = 12;
    var gap = 12;

    // 窄屏：面板贴底，左右留边
    if (vw <= 720) {
      var h = Math.min(Math.round(vh * 0.52), 380);
      panel.style.width = (vw - margin * 2) + 'px';
      panel.style.height = h + 'px';
      panel.style.left = margin + 'px';
      panel.style.top = Math.max(margin, vh - margin - h) + 'px';
      return;
    }

    panel.style.width = PANEL_W + 'px';
    panel.style.height = PANEL_H + 'px';

    var stage = document.getElementById('oml2d-stage');
    if (!stage) {
      // 模型尚未创建：先放右下角
      panel.style.left = (vw - PANEL_W - margin) + 'px';
      panel.style.top = (vh - PANEL_H - margin) + 'px';
      return;
    }

    var sr = stage.getBoundingClientRect();
    // 模型在哪半边，面板就贴到另一侧，底部与模型对齐
    var toRight = sr.left + sr.width / 2 < vw / 2;
    var left = toRight ? sr.right + gap : sr.left - PANEL_W - gap;
    left = clampNum(left, margin, vw - PANEL_W - margin);
    var top = clampNum(sr.bottom - PANEL_H, margin, vh - PANEL_H - margin);

    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  /* 拖动过之后只做边界收拢，不再自动贴模型 */
  function clampPanelPos() {
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var w = panel.offsetWidth || PANEL_W;
    var h = panel.offsetHeight || PANEL_H;
    var left = clampNum(parseFloat(panel.style.left) || 0, 8, vw - w - 8);
    var top = clampNum(parseFloat(panel.style.top) || 0, 8, vh - h - 8);
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  /* 面板拖拽：按住头部独立移动，不影响 Live2D 位置 */
  var panelDragged = false;
  var panelDrag = null;
  var chatHead = panel.querySelector('#oml2d-chat-head');

  chatHead.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (e.target.closest('#oml2d-chat-close')) return;
    var r = panel.getBoundingClientRect();
    panelDrag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    panel.classList.add('is-dragging');
    e.preventDefault();
  });

  document.addEventListener('pointermove', function (e) {
    if (!panelDrag) return;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var left = panelDrag.left + (e.clientX - panelDrag.x);
    var top = panelDrag.top + (e.clientY - panelDrag.y);
    left = clampNum(left, 8, vw - panel.offsetWidth - 8);
    top = clampNum(top, 8, vh - panel.offsetHeight - 8);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  });

  document.addEventListener('pointerup', function () {
    if (!panelDrag) return;
    panelDrag = null;
    panelDragged = true;
    panel.classList.remove('is-dragging');
  });

  function placeChatPanel() {
    var narrow = document.documentElement.clientWidth <= 720;
    if (panelDragged && !narrow) clampPanelPos();
    else positionChatUi();
  }

  function toggleChat(forceOpen) {
    chatOpen = typeof forceOpen === 'boolean' ? forceOpen : !chatOpen;
    if (chatOpen) {
      panel.classList.add('is-open');
      placeChatPanel();
      input.focus();
    } else {
      panel.classList.remove('is-open');
    }
  }

  window.addEventListener('resize', function () {
    if (chatOpen) placeChatPanel();
  });

  panel.querySelector('#oml2d-chat-close').addEventListener('click', function () {
    toggleChat(false);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  input.addEventListener('input', function () {
    input.style.height = '38px';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) {
      if (abortController) abortController.abort();
      return;
    }
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = '38px';
    sendMessage(text);
  });

  function handleFrame(raw, msg) {
    var payload = '';
    raw.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf('data:') === 0) payload += line.slice(5).trim();
    });
    if (!payload || payload === '[DONE]') return;
    var evt;
    try { evt = JSON.parse(payload); } catch (err) { return; }
    if (evt.type === 'delta' && evt.content) {
      msg.body.nodeValue += evt.content;
      scrollLog();
    } else if (evt.type === 'error') {
      msg.el.classList.add('error');
      msg.body.nodeValue += '\n[出错了] ' + (evt.message || '未知错误');
      scrollLog();
    }
  }

  function sendMessage(text) {
    addMessage('user', text);
    var msg = addStreamBubble();
    setBusy(true);
    abortController = new AbortController();

    fetch(CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ message: text, thread_id: THREAD_ID }),
      signal: abortController.signal
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (!res.body) throw new Error('当前浏览器不支持流式读取');
      var reader = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) return;
          buffer += decoder.decode(chunk.value, { stream: true });
          buffer = buffer.replace(/\r\n/g, '\n');
          var frames = buffer.split('\n\n');
          buffer = frames.pop();
          frames.forEach(function (frame) { handleFrame(frame, msg); });
          return pump();
        });
      }

      return pump().then(function () {
        if (buffer.trim()) handleFrame(buffer, msg);
        if (!msg.body.nodeValue) {
          msg.body.nodeValue = '（大肥鱼这次没说话，再问一次试试～）';
        }
      });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') {
        msg.body.nodeValue += '\n[已停止]';
      } else {
        msg.el.classList.add('error');
        msg.body.nodeValue += '\n[连接失败] ' + (err && err.message ? err.message : err);
      }
    }).then(function () {
      if (msg.caret.parentNode) msg.caret.parentNode.removeChild(msg.caret);
      abortController = null;
      setBusy(false);
      scrollLog();
    });
  }

  addMessage('bot', '嗨～我是大肥鱼 🐳\n博客、技术或者随便聊聊，都可以问我！');

  /* 5) 组件配置 */
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
            title: '和大肥鱼聊天 🐳',
            onClick: function () { toggleChat(); }
          }]);
      }
    }
  };

  /* 6) 加载 oh-my-live2d 并初始化：本地优先，逐个源回退 */
  function loadLib(index) {
    if (index >= OML2D_SOURCES.length) {
      console.warn('[Live2D] oh-my-live2d 所有源均加载失败');
      return;
    }
    var script = document.createElement('script');
    script.src = OML2D_SOURCES[index];
    script.onload = function () {
      if (window.OML2D) window.OML2D.loadOml2d(options);
    };
    script.onerror = function () {
      console.warn('[Live2D] 加载失败，尝试下一个源：' + OML2D_SOURCES[index]);
      if (script.parentNode) script.parentNode.removeChild(script);
      loadLib(index + 1);
    };
    document.head.appendChild(script);
  }
  loadLib(0);

  /* 7) 「加载成功」提示 3 秒后隐藏；切换到其它文案时自动恢复 */
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
