/*
 * 大肥鱼 Live2D 组件：CDN、模型配置、菜单、拖拽、AI 聊天全部集中在这里。
 * 模板里只需一行引用（见 templates/layout.html 末尾）。
 */
(function () {
  'use strict';

  var current = document.currentScript;
  var MODEL = (current && current.getAttribute('data-model')) ||
              '/live2d/dafeiyu/c_0120.model3.json';
  // SSE 接口地址：可用 <script data-chat-api="..."> 覆盖，默认走同源 /api/chat
  var CHAT_API = (current && current.getAttribute('data-chat-api')) || '/api/chat';
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
    '#oml2d-wrapper.is-dragging #oml2d-stage { cursor:grabbing !important; }',

    /* ===== 小鲸鱼聊天面板（与模型同属 wrapper，拖拽时一起移动） ===== */
    '#oml2d-chat-launcher { position:absolute; right:348px; bottom:150px; padding:7px 13px;',
    '  border:0; border-radius:999px; background:linear-gradient(135deg,#7fd8ff,#a5b4fc);',
    '  color:#fff; font-family:inherit; font-size:12px; font-weight:600; letter-spacing:.5px;',
    '  box-shadow:0 4px 14px rgba(80,150,220,.35); cursor:pointer; user-select:none;',
    '  white-space:nowrap; transition:transform .18s,box-shadow .18s; }',
    '#oml2d-chat-launcher:hover { transform:translateY(-2px); box-shadow:0 7px 18px rgba(80,150,220,.45); }',
    '#oml2d-chat { position:absolute; right:348px; bottom:150px; width:320px; height:420px;',
    '  display:none; flex-direction:column; overflow:hidden; border-radius:18px;',
    '  background:rgba(255,255,255,.96); border:1px solid rgba(120,190,230,.45);',
    '  box-shadow:0 12px 40px rgba(40,90,150,.22);',
    '  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; font-size:14px; color:#334155; }',
    '#oml2d-chat.is-open { display:flex; animation:oml2d-chat-in .22s ease-out; }',
    '@keyframes oml2d-chat-in { from { opacity:0; transform:translateY(10px) scale(.97); }',
    '  to { opacity:1; transform:none; } }',
    '#oml2d-chat-head { display:flex; align-items:center; gap:6px; padding:10px 12px;',
    '  background:linear-gradient(135deg,#e0f7ff,#eef2ff); border-bottom:1px solid #d8eaf5;',
    '  font-weight:700; color:#0f6f9c; }',
    '#oml2d-chat-head .oml2d-chat-sub { margin-left:auto; font-size:11px; font-weight:400; color:#7aa5bd; }',
    '#oml2d-chat-close { border:0; background:transparent; color:#5b8ca8; cursor:pointer;',
    '  font-size:17px; line-height:1; padding:2px 6px; border-radius:8px; }',
    '#oml2d-chat-close:hover { background:rgba(255,255,255,.7); }',
    '#oml2d-chat-log { flex:1; min-height:0; overflow-y:auto; padding:12px;',
    '  display:flex; flex-direction:column; gap:10px; scrollbar-width:thin;',
    '  scrollbar-color:#b9dcea transparent; }',
    '#oml2d-chat-log::-webkit-scrollbar { width:6px; }',
    '#oml2d-chat-log::-webkit-scrollbar-thumb { background:#b9dcea; border-radius:3px; }',
    '.oml2d-msg { max-width:86%; padding:8px 11px; border-radius:14px; white-space:pre-wrap;',
    '  word-break:break-word; font-size:13px; line-height:1.6; }',
    '.oml2d-msg.user { align-self:flex-end; background:#dff3ff; color:#134e6a;',
    '  border-bottom-right-radius:4px; }',
    '.oml2d-msg.bot { align-self:flex-start; background:#f4f8fb; color:#334155;',
    '  border:1px solid #e3eef5; border-bottom-left-radius:4px; }',
    '.oml2d-msg.error { background:#fff1f2; color:#be123c; border-color:#fecdd3; }',
    '.oml2d-caret { display:inline-block; width:7px; height:13px; margin-left:2px;',
    '  vertical-align:-2px; background:#38bdf8; animation:oml2d-blink 1s steps(2,start) infinite; }',
    '@keyframes oml2d-blink { to { visibility:hidden; } }',
    '#oml2d-chat-form { display:flex; gap:8px; padding:10px; border-top:1px solid #e3eef5; background:#fbfdff; }',
    '#oml2d-chat-input { flex:1; min-width:0; resize:none; height:38px; padding:8px 10px;',
    '  border:1px solid #cfe3ef; border-radius:10px; outline:none; background:#fff; color:#334155;',
    '  font-family:inherit; font-size:13px; line-height:1.4; }',
    '#oml2d-chat-input:focus { border-color:#7dd3fc; box-shadow:0 0 0 3px rgba(125,211,252,.22); }',
    '#oml2d-chat-send { flex:0 0 60px; border:0; border-radius:10px; cursor:pointer;',
    '  background:linear-gradient(135deg,#38bdf8,#818cf8); color:#fff;',
    '  font-family:inherit; font-size:13px; font-weight:600;',
    '  transition:filter .18s,transform .18s; }',
    '#oml2d-chat-send:hover:not(:disabled) { filter:brightness(1.06); transform:translateY(-1px); }',
    '#oml2d-chat-send:disabled { opacity:.55; cursor:not-allowed; }',
    '@media (max-width:720px) {',
    '  #oml2d-chat { left:12px; right:12px; width:auto; bottom:150px; height:min(52vh,380px); }',
    '  #oml2d-chat-launcher { left:12px; right:12px; bottom:150px; text-align:center; }',
    '}'
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

  /* 4) 小鲸鱼 AI 聊天：SSE 流式输出 + 紧贴 Live2D 的对话气泡 */
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

  var launcher = document.createElement('button');
  launcher.id = 'oml2d-chat-launcher';
  launcher.type = 'button';
  launcher.textContent = '🐳 和小鲸鱼聊天';
  wrapper.appendChild(launcher);

  var panel = document.createElement('div');
  panel.id = 'oml2d-chat';
  panel.innerHTML =
    '<div id="oml2d-chat-head">' +
      '<span>🐳 小鲸鱼</span>' +
      '<span class="oml2d-chat-sub">DeepSeek 驱动</span>' +
      '<button type="button" id="oml2d-chat-close" aria-label="关闭聊天">✕</button>' +
    '</div>' +
    '<div id="oml2d-chat-log"></div>' +
    '<form id="oml2d-chat-form">' +
      '<textarea id="oml2d-chat-input" rows="1" maxlength="2000" ' +
        'placeholder="问问博客或技术的问题～"></textarea>' +
      '<button type="submit" id="oml2d-chat-send">发送</button>' +
    '</form>';
  wrapper.appendChild(panel);

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
      ? '小鲸鱼正在思考…（点“停止”可打断）'
      : '问问博客或技术的问题～';
    if (!state && chatOpen) input.focus();
  }

  function toggleChat(forceOpen) {
    chatOpen = typeof forceOpen === 'boolean' ? forceOpen : !chatOpen;
    panel.classList.toggle('is-open', chatOpen);
    launcher.style.display = chatOpen ? 'none' : '';
    if (chatOpen) input.focus();
  }

  launcher.addEventListener('click', function () { toggleChat(true); });
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
          msg.body.nodeValue = '（小鲸鱼这次没说话，再问一次试试～）';
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

  addMessage('bot', '嗨～我是小鲸鱼 🐳\n博客、技术或者随便聊聊，都可以问我！');

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
            title: '和小鲸鱼聊天 🐳',
            onClick: function () { toggleChat(); }
          }]);
      }
    }
  };

  /* 6) 加载 CDN 并初始化 */
  var script = document.createElement('script');
  script.src = CDN;
  script.onload = function () {
    if (window.OML2D) window.OML2D.loadOml2d(options);
  };
  script.onerror = function () {
    console.warn('[Live2D] CDN 加载失败：' + CDN);
  };
  document.head.appendChild(script);

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
