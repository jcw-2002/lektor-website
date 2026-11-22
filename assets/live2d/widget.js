/*
 * 大肥鱼 Live2D 组件：库加载、模型配置、菜单、拖拽、AI 聊天全部集中在这里。
 * 模板里只需一行引用（见 templates/layout.html 末尾）。
 */
(function () {
  'use strict';

  var current = document.currentScript;
  var MODEL = (current && current.getAttribute('data-model')) ||
              '/live2d/dafeiyu/c_0120.model3.json';
  // SSE 接口地址：可用 <script data-chat-api="..."> 覆盖
  var CHAT_API = (current && current.getAttribute('data-chat-api')) || defaultChatApi();

  /* 本地预览（lektor server 跑在 5000 之类）时同源没有 /api/chat，POST 会被
     开发服务器回 405；自动指向本机启动的 FastAPI。线上仍是同源，由 Nginx 反代。 */
  function defaultChatApi() {
    var host = location.hostname;
    var local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (local && location.port !== '8000') {
      return location.protocol + '//' + host + ':8000/api/chat';
    }
    return '/api/chat';
  }

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
    /* 缩放把手：右边缘、下边缘、右下角 */
    '.oml2d-chat-resize { position:absolute; z-index:3; touch-action:none; }',
    '.oml2d-resize-e { top:0; right:0; width:6px; height:100%; cursor:ew-resize; }',
    '.oml2d-resize-s { left:0; bottom:0; height:6px; width:100%; cursor:ns-resize; }',
    '.oml2d-resize-se { right:0; bottom:0; width:16px; height:16px; cursor:nwse-resize;',
    '  border-bottom-right-radius:8px; }',
    '.oml2d-resize-se::after { content:""; position:absolute; right:3px; bottom:3px;',
    '  width:7px; height:7px; border-right:2px solid #d2d2d2; border-bottom:2px solid #d2d2d2;',
    '  border-radius:0 0 2px 0; }',
    '#oml2d-chat.is-resizing { user-select:none; }',
    '#oml2d-chat.is-resizing #oml2d-chat-log { pointer-events:none; }',
    '.oml2d-resize-se:hover::after { border-color:#1f1f1f; }',
    '#oml2d-chat-head { display:flex; align-items:center; gap:8px; padding:10px 12px;',
    '  background:#fafafa; border-bottom:1px solid #eee; color:#1f1f1f;',
    '  cursor:grab; user-select:none; touch-action:none; }',
    '#oml2d-chat.is-dragging #oml2d-chat-head { cursor:grabbing; }',
    '.oml2d-chat-avatar { font-size:16px; line-height:1; }',
    '.oml2d-chat-title { font-size:13px; font-weight:600; }',
    '#oml2d-chat-close, #oml2d-chat-clear { border:0; background:transparent;',
    '  color:#999; cursor:pointer; font-size:13px; line-height:1;',
    '  width:22px; height:22px; border-radius:4px;',
    '  display:flex; align-items:center; justify-content:center; }',
    '#oml2d-chat-clear { margin-left:auto; width:auto; padding:0 6px; font-size:12px; }',
    '#oml2d-chat-close:hover, #oml2d-chat-clear:hover { background:#f0f0f0; color:#333; }',
    '#oml2d-chat-log { flex:1; min-height:0; overflow-y:auto; padding:12px;',
    '  display:flex; flex-direction:column; gap:8px;',
    '  scrollbar-width:thin; scrollbar-color:#d4d4d4 transparent; }',
    '#oml2d-chat-log::-webkit-scrollbar { width:5px; }',
    '#oml2d-chat-log::-webkit-scrollbar-thumb { background:#d4d4d4; border-radius:3px; }',
    '#oml2d-chat-log::-webkit-scrollbar-track { background:transparent; }',
    '.oml2d-msg { max-width:88%; padding:8px 12px; border-radius:10px;',
    '  word-break:break-word; font-size:13px; line-height:1.65; }',
    '.oml2d-msg.user { align-self:flex-end; background:#1f1f1f; color:#fff;',
    '  white-space:pre-wrap; border-bottom-right-radius:3px; }',
    '.oml2d-msg.bot { align-self:flex-start; background:#f8f8f9; color:#2b2b2b;',
    '  border:1px solid #ededee; border-bottom-left-radius:3px; }',
    '.oml2d-msg.error { background:#fff; color:#2b2b2b; border:1px solid #d8d8d8; }',

    /* ===== 气泡内的 Markdown 排版 ===== */
    '.oml2d-md > :first-child { margin-top:0; }',
    '.oml2d-md > :last-child { margin-bottom:0; }',
    '.oml2d-md p { margin:0 0 6px; }',
    '.oml2d-md h1,.oml2d-md h2,.oml2d-md h3,.oml2d-md h4,.oml2d-md h5,.oml2d-md h6 {',
    '  margin:10px 0 5px; font-size:13px; font-weight:600; line-height:1.45; }',
    '.oml2d-md ul,.oml2d-md ol { margin:0 0 6px; padding-left:18px; }',
    '.oml2d-md li { margin:2px 0; }',
    '.oml2d-md li::marker { color:#9a9a9a; }',
    '.oml2d-md strong { font-weight:600; color:#111; }',
    '.oml2d-md del { color:#9a9a9a; }',
    '.oml2d-md a { color:#1f1f1f; text-decoration:underline; text-underline-offset:2px;',
    '  word-break:break-all; }',
    '.oml2d-md code { font-family:ui-monospace,SFMono-Regular,Consolas,monospace;',
    '  font-size:12px; background:#eaeaec; border-radius:3px; padding:1px 4px; }',
    '.oml2d-md pre { margin:6px 0; padding:8px 10px; background:#eeeef0; border-radius:6px;',
    '  overflow-x:auto; line-height:1.5; }',
    '.oml2d-md pre code { display:block; padding:0; background:transparent;',
    '  white-space:pre; font-size:12px; }',
    '.oml2d-md blockquote { margin:6px 0; padding:2px 0 2px 8px;',
    '  border-left:2px solid #dcdcdc; color:#666; }',
    '.oml2d-md hr { border:0; border-top:1px solid #e4e4e4; margin:8px 0; }',
    '.oml2d-md table { display:block; overflow-x:auto; margin:6px 0;',
    '  border-collapse:collapse; font-size:12px; }',
    '.oml2d-md th,.oml2d-md td { border:1px solid #e2e2e4; padding:4px 8px; text-align:left; }',
    '.oml2d-md th { background:#ececee; font-weight:600; }',
    '.oml2d-md .oml2d-lang { display:block; margin-bottom:4px; font-size:11px; color:#8c8c8c;',
    '  font-family:ui-monospace,monospace; }',
    /* 流式输出时的光标：挂在最后一段的行尾 */
    '.oml2d-msg.is-stream .oml2d-md > :last-child::after { content:""; display:inline-block;',
    '  width:6px; height:12px; margin-left:2px; vertical-align:-2px; background:#b0b0b0;',
    '  animation:oml2d-blink 1s steps(1,end) infinite; }',
    '@keyframes oml2d-blink { 50% { opacity:0; } }',
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
    '@media (max-width:720px) { #oml2d-chat { border-radius:6px; }',
    '  .oml2d-chat-resize { display:none; } }'
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
  var HISTORY_KEY = 'oml2d-chat-history';
  var OPEN_KEY = 'oml2d-chat-open';
  var MAX_HISTORY = 40;          // 只留最近 40 条，防止 sessionStorage 超配额
  var GREETING = '嗨～我是大肥鱼 🐳\n博客、技术或者随便聊聊，都可以问我！';

  /* 会话 ID：服务端用它去 LangGraph 的检查点里找多轮记忆。
     放在 sessionStorage 里，所以 F5 或 PJAX 切页后仍是同一个会话，
     恢复出来的历史消息也就依然能作为后续对话的上下文。 */
  function newThreadId() {
    return 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function readThreadId() {
    var id = null;
    try { id = sessionStorage.getItem(THREAD_KEY); } catch (e) {}
    if (!id) {
      id = newThreadId();
      try { sessionStorage.setItem(THREAD_KEY, id); } catch (e) {}
    }
    return id;
  }

  var THREAD_ID = readThreadId();

  var chatOpen = false;
  var busy = false;
  var abortController = null;
  var activeStream = null;       // 正在输出的气泡，页面被关闭时用来抢救半截回复

  var panel = document.createElement('div');
  panel.id = 'oml2d-chat';
  panel.innerHTML =
    '<div id="oml2d-chat-head">' +
      '<span class="oml2d-chat-avatar">🐳</span>' +
      '<span class="oml2d-chat-title">大肥鱼</span>' +
      '<button type="button" id="oml2d-chat-clear" aria-label="清空对话" ' +
        'title="清空对话记录（同时重置会话上下文）">清空</button>' +
      '<button type="button" id="oml2d-chat-close" aria-label="关闭聊天">✕</button>' +
    '</div>' +
    '<div id="oml2d-chat-log"></div>' +
    '<form id="oml2d-chat-form">' +
      '<textarea id="oml2d-chat-input" rows="1" maxlength="2000" ' +
        'placeholder="问问博客或技术的问题～"></textarea>' +
      '<button type="submit" id="oml2d-chat-send">发送</button>' +
    '</form>' +
    '<div class="oml2d-chat-resize oml2d-resize-e" data-dir="e"></div>' +
    '<div class="oml2d-chat-resize oml2d-resize-s" data-dir="s"></div>' +
    '<div class="oml2d-chat-resize oml2d-resize-se" data-dir="se"></div>';
  // 面板挂在 body 上（不在 wrapper 内），拖动模型时不会带着它一起动
  document.body.appendChild(panel);

  var log = panel.querySelector('#oml2d-chat-log');
  var form = panel.querySelector('#oml2d-chat-form');
  var input = panel.querySelector('#oml2d-chat-input');
  var sendBtn = panel.querySelector('#oml2d-chat-send');

  /* 4.1) 对话历史持久化（sessionStorage）
     - 只存纯文本数组，渲染仍走 addMessage / mdToHtml，样式与流式输出完全一致；
     - F5 硬刷新、PJAX 切页、同一标签页里再次进入都能恢复；
     - 关闭标签页后自动清空，不会把上一次的闲聊带进新会话。 */
  var chatHistory = readHistory();

  function readHistory() {
    var list = [];
    try {
      var raw = sessionStorage.getItem(HISTORY_KEY);
      if (!raw) return list;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return list;
      list = parsed.filter(function (item) {
        return item && (item.role === 'user' || item.role === 'bot' || item.role === 'error') &&
               typeof item.text === 'string' && item.text.length > 0;
      }).map(function (item) {
        return { role: item.role, text: item.text };
      });
      if (list.length > MAX_HISTORY) list = list.slice(-MAX_HISTORY);
    } catch (e) {
      list = [];   // 存储被写坏 / 隐私模式不可读：直接丢弃，不能影响组件初始化
    }
    return list;
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
    } catch (e) {
      // 隐私模式或配额用尽：忽略，历史仅保留在内存中
    }
  }

  function pushHistory(role, text) {
    if (!text) return;
    chatHistory.push({ role: role, text: text });
    if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
    saveHistory();
  }

  function readChatOpen() {
    try { return sessionStorage.getItem(OPEN_KEY) === '1'; } catch (e) { return false; }
  }

  function saveChatOpen(open) {
    try { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch (e) {}
  }

  // 流式输出还没结束就刷新/关页面时，把已生成的部分存下来，避免整段回复丢失
  window.addEventListener('pagehide', function () {
    var msg = activeStream;
    if (!msg || !msg.raw || !msg.raw.trim()) return;
    var role = msg.el.classList.contains('error') ? 'error' : 'bot';
    var text = msg.raw + '\n\n[页面已关闭，回复被截断]';
    if (msg.flushed) {
      // 从 bfcache 回来又被打断：覆盖上一次的残稿，不要堆两条
      chatHistory[chatHistory.length - 1] = { role: role, text: text };
      saveHistory();
    } else {
      pushHistory(role, text);
      msg.flushed = true;
    }
  });

  function scrollLog() { log.scrollTop = log.scrollHeight; }

  /* 3.1) 装饰符号过滤：模型爱吐 🫧 🐳 🌊 之类，界面里统一去掉
     （只处理围栏代码块之外的正文，且不会破坏行首缩进/列表） */
  var DECOR_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
  var VARIATION_RE = /[\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

  function cleanText(text) {
    var lines = String(text == null ? '' : text).split('\n');
    var inFence = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s{0,3}(?:`{3,}|~{3,})/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      line = line.replace(DECOR_RE, '').replace(VARIATION_RE, '');
      // 符号被删掉后留下的多余空格，只在中日韩文字之间收拢，避免破坏「npm 安装」这类混排
      line = line.replace(/[ \t]{2,}/g, ' ');
      line = line.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])[ \t]+(?=[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1');
      line = line.replace(/[ \t]+(?=[，。！？；：、）】」』…])/g, '');
      lines[i] = line;
    }
    return lines.join('\n');
  }

  /* 3.2) 极简 Markdown 渲染：先转义再拼标签，输出是安全的 HTML 片段 */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function safeUrl(url) {
    return /^(?:https?:\/\/|mailto:|\/|#)/i.test(url) ? url : '#';
  }

  function inlineMd(str) {
    var stash = [];
    // 行内代码先占位，避免里面的 ** * 被继续解析
    var s = str.replace(/`([^`\n]+)`/g, function (_m, code) {
      stash.push('<code>' + code + '</code>');
      return '\u0000' + (stash.length - 1) + '\u0000';
    });
    s = s.replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, function (_m, label, url) {
      return '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener noreferrer">' +
             label + '</a>';
    });
    s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<>)）]+)/g, function (_m, pre, url) {
      return pre + '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener noreferrer">' +
             url + '</a>';
    });
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, function (_m, idx) { return stash[Number(idx)]; });
  }

  /* 列表按缩进还原层级，避免子项被拍平成同级 */
  function parseListTree(entries) {
    var root = { indent: -1, children: [] };
    var stack = [root];
    entries.forEach(function (entry) {
      while (stack.length > 1 && entry.indent <= stack[stack.length - 1].indent) stack.pop();
      var node = {
        indent: entry.indent,
        ordered: entry.ordered,
        start: entry.start,
        text: entry.text,
        children: []
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });
    return root.children;
  }

  function serializeList(nodes) {
    if (!nodes.length) return '';
    var ordered = nodes[0].ordered;
    var tag = ordered ? 'ol' : 'ul';
    var head = '<' + tag + (ordered && nodes[0].start !== 1 ? ' start="' + nodes[0].start + '"' : '') + '>';
    return head + nodes.map(function (node) {
      return '<li>' + inlineMd(escapeHtml(node.text)).replace(/\n/g, '<br>') +
             serializeList(node.children) + '</li>';
    }).join('') + '</' + tag + '>';
  }

  function buildTable(rows) {
    function cells(row) {
      return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
        .map(function (cell) { return inlineMd(escapeHtml(cell.trim())); });
    }
    var head = cells(rows[0]);
    var body = rows.slice(2).map(function (row) {
      return '<tr>' + cells(row).map(function (cell) { return '<td>' + cell + '</td>'; })
        .join('') + '</tr>';
    });
    return '<table><thead><tr>' +
           head.map(function (cell) { return '<th>' + cell + '</th>'; }).join('') +
           '</tr></thead><tbody>' + body.join('') + '</tbody></table>';
  }

  function mdToHtml(src) {
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // 围栏代码块；流式输出尚未闭合时也先按代码块渲染
      var fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/);
      if (fence) {
        var mark = fence[1].charAt(0);
        var size = fence[1].length;
        var lang = fence[2];
        var code = [];
        i++;
        while (i < lines.length) {
          var close = lines[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
          if (close && close[1].charAt(0) === mark && close[1].length >= size) { i++; break; }
          code.push(lines[i]);
          i++;
        }
        out.push('<pre>' + (lang ? '<span class="oml2d-lang">' + escapeHtml(lang) + '</span>' : '') +
                 '<code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }

      if (!line.trim()) { i++; continue; }

      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      var head = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
      if (head) {
        var lv = Math.min(head[1].length + 2, 6);
        out.push('<h' + lv + '>' + inlineMd(escapeHtml(head[2].trim())) + '</h' + lv + '>');
        i++;
        continue;
      }

      if (/^\s{0,3}>/.test(line)) {
        var quoted = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + mdToHtml(quoted.join('\n')) + '</blockquote>');
        continue;
      }

      // 表格：首行含 |，次行是含 | 的分隔行
      if (line.indexOf('|') !== -1 && /-/.test(lines[i + 1] || '') &&
          (lines[i + 1] || '').indexOf('|') !== -1 &&
          /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) {
        var rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) {
          rows.push(lines[i]);
          i++;
        }
        out.push(buildTable(rows));
        continue;
      }

      var item = line.match(/^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(\S.*)$/);
      if (item) {
        var entries = [];
        while (i < lines.length) {
          var m = lines[i].match(/^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(\S.*)$/);
          if (!m) break;
          var text = m[4];
          var indent = m[1].replace(/\t/g, '    ').length;
          var isOrdered = !!m[3];
          i++;
          while (i < lines.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) &&
                 !/^\s*(?:[-*+]|\d{1,3}[.)])\s+/.test(lines[i])) {
            text += '\n' + lines[i].trim();
            i++;
          }
          entries.push({
            indent: indent,
            ordered: isOrdered,
            start: isOrdered ? parseInt(m[3], 10) : 1,
            text: text
          });
        }
        out.push(serializeList(parseListTree(entries)));
        continue;
      }

      var para = [];
      while (i < lines.length && lines[i].trim() &&
             !/^\s{0,3}(?:#{1,6}\s|>|`{3,}|~{3,})/.test(lines[i]) &&
             !/^\s*(?:[-*+]|\d{1,3}[.)])\s+/.test(lines[i]) &&
             !/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(lines[i])) {
        para.push(lines[i].trim());
        i++;
      }
      if (!para.length) { para.push(lines[i].replace(/^\s+/, '')); i++; }
      out.push('<p>' + inlineMd(escapeHtml(para.join('\n'))).replace(/\n/g, '<br>') + '</p>');
    }

    return out.join('');
  }

  /* silent=true 表示这条消息来自 sessionStorage 的恢复，不再回写存储 */
  function addMessage(role, text, silent) {
    var el = document.createElement('div');
    el.className = 'oml2d-msg ' + (role === 'user' ? 'user' : role === 'error' ? 'error' : 'bot');
    if (role === 'user') {
      el.textContent = text;
    } else {
      var content = document.createElement('div');
      content.className = 'oml2d-md';
      content.innerHTML = mdToHtml(cleanText(text));
      el.appendChild(content);
    }
    log.appendChild(el);
    scrollLog();
    if (!silent) pushHistory(role, text);
    return el;
  }

  // 从 sessionStorage 还原历史；返回 false 说明是全新会话，调用方补一条欢迎语
  function restoreHistory() {
    if (!chatHistory.length) return false;
    chatHistory.forEach(function (item) {
      addMessage(item.role, item.text, true);
    });
    return true;
  }

  /* 流式气泡：每帧把累积的原文重新渲染成 Markdown */
  var paintFrame = null;
  var streamMsg = null;

  function paintBubble(msg) {
    try {
      var html = mdToHtml(cleanText(msg.raw));
      // 首帧还没有内容时留一个空段落，好让流式光标有落脚点
      msg.content.innerHTML = html || '<p></p>';
    } catch (err) {
      msg.content.textContent = cleanText(msg.raw);
    }
  }

  function schedulePaint(msg) {
    streamMsg = msg;
    if (paintFrame) return;
    paintFrame = requestAnimationFrame(function () {
      paintFrame = null;
      if (streamMsg) paintBubble(streamMsg);
      scrollLog();
    });
  }

  function addStreamBubble() {
    var el = document.createElement('div');
    el.className = 'oml2d-msg bot is-stream';
    var content = document.createElement('div');
    content.className = 'oml2d-md';
    el.appendChild(content);
    log.appendChild(el);
    scrollLog();
    return { el: el, content: content, raw: '' };
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
  var MIN_W = 260;
  var MIN_H = 240;
  var SIZE_KEY = 'oml2d-chat-size';

  function clampNum(v, min, max) {
    return max < min ? max : Math.max(min, Math.min(v, max));
  }

  var panelSize = readPanelSize();

  function readPanelSize() {
    try {
      var v = JSON.parse(localStorage.getItem(SIZE_KEY));
      if (v && typeof v.w === 'number' && typeof v.h === 'number') {
        return { w: v.w, h: v.h };
      }
    } catch (e) {}
    return { w: PANEL_W, h: PANEL_H };
  }

  function savePanelSize() {
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(panelSize)); } catch (e) {}
  }

  /* 尺寸收拢到视口内后写进样式；窗口变小也不会把面板撑出屏幕 */
  function applyPanelSize() {
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var maxW = vw - 16;
    var maxH = vh - 16;
    panelSize.w = clampNum(panelSize.w, Math.min(MIN_W, maxW), Math.max(MIN_W, maxW));
    panelSize.h = clampNum(panelSize.h, Math.min(MIN_H, maxH), Math.max(MIN_H, maxH));
    panel.style.width = panelSize.w + 'px';
    panel.style.height = panelSize.h + 'px';
  }

  /* 依据模型舞台的位置把面板贴到旁边（面板固定在 body 上，坐标即视口坐标） */
  function positionChatUi() {
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var margin = 12;
    var gap = 12;

    // 窄屏：面板贴底，左右留边，不参与自定义尺寸
    if (vw <= 720) {
      var h = Math.min(Math.round(vh * 0.52), 380);
      panel.style.width = (vw - margin * 2) + 'px';
      panel.style.height = h + 'px';
      panel.style.left = margin + 'px';
      panel.style.top = Math.max(margin, vh - margin - h) + 'px';
      return;
    }

    applyPanelSize();
    var w = panelSize.w;
    var hgt = panelSize.h;

    var stage = document.getElementById('oml2d-stage');
    if (!stage) {
      // 模型尚未创建：先放右下角
      panel.style.left = (vw - w - margin) + 'px';
      panel.style.top = (vh - hgt - margin) + 'px';
      return;
    }

    var sr = stage.getBoundingClientRect();
    // 模型在哪半边，面板就贴到另一侧，底部与模型对齐
    var toRight = sr.left + sr.width / 2 < vw / 2;
    var left = toRight ? sr.right + gap : sr.left - w - gap;
    left = clampNum(left, margin, vw - w - margin);
    var top = clampNum(sr.bottom - hgt, margin, vh - hgt - margin);

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
    if (e.target.closest('#oml2d-chat-close, #oml2d-chat-clear')) return;
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

  /* 缩放面板：拖右边缘改宽、下边缘改高、右下角同时改；松手记住尺寸 */
  var panelResize = null;

  Array.prototype.forEach.call(panel.querySelectorAll('.oml2d-chat-resize'), function (handle) {
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var r = panel.getBoundingClientRect();
      panelResize = {
        dir: handle.getAttribute('data-dir'),
        x: e.clientX,
        y: e.clientY,
        w: r.width,
        h: r.height,
        left: r.left,
        top: r.top
      };
      panel.classList.add('is-resizing');
      e.preventDefault();
      e.stopPropagation();
    });
  });

  document.addEventListener('pointermove', function (e) {
    if (!panelResize) return;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var dir = panelResize.dir;
    if (dir.indexOf('e') !== -1) {
      // 向右拉宽，不能超出视口右边界
      var maxW = Math.max(MIN_W, vw - panelResize.left - 8);
      panelSize.w = clampNum(panelResize.w + (e.clientX - panelResize.x), MIN_W, maxW);
      panel.style.width = panelSize.w + 'px';
    }
    if (dir.indexOf('s') !== -1) {
      var maxH = Math.max(MIN_H, vh - panelResize.top - 8);
      panelSize.h = clampNum(panelResize.h + (e.clientY - panelResize.y), MIN_H, maxH);
      panel.style.height = panelSize.h + 'px';
    }
  });

  function endResize() {
    if (!panelResize) return;
    panelResize = null;
    panel.classList.remove('is-resizing');
    savePanelSize();
    clampPanelPos();
  }

  document.addEventListener('pointerup', endResize);
  document.addEventListener('pointercancel', endResize);

  function placeChatPanel() {
    var narrow = document.documentElement.clientWidth <= 720;
    if (panelDragged && !narrow) clampPanelPos();
    else positionChatUi();
  }

  function toggleChat(forceOpen) {
    chatOpen = typeof forceOpen === 'boolean' ? forceOpen : !chatOpen;
    saveChatOpen(chatOpen);       // 展开/收起状态也持久化，刷新后原样恢复
    if (chatOpen) {
      panel.classList.add('is-open');
      placeChatPanel();
      input.focus();
    } else {
      panel.classList.remove('is-open');
    }
  }

  /* 清空对话：历史、面板、会话 ID 一起重置。
     换掉 thread_id 是为了让服务端 MemorySaver 里的旧上下文不再被复用，
     否则「清空」只是清了个界面。 */
  function clearChat() {
    if (busy && abortController) abortController.abort();
    chatHistory = [];
    try { sessionStorage.removeItem(HISTORY_KEY); } catch (e) {}
    THREAD_ID = newThreadId();
    try { sessionStorage.setItem(THREAD_KEY, THREAD_ID); } catch (e) {}
    activeStream = null;
    log.innerHTML = '';
    addMessage('bot', GREETING);
    if (chatOpen) input.focus();
  }

  window.addEventListener('resize', function () {
    if (chatOpen) placeChatPanel();
  });

  // 恢复出来的面板可能比 Live2D 模型先就位，等 load 后再贴一次模型
  window.addEventListener('load', function () {
    if (chatOpen) placeChatPanel();
  });

  panel.querySelector('#oml2d-chat-close').addEventListener('click', function () {
    toggleChat(false);
  });

  panel.querySelector('#oml2d-chat-clear').addEventListener('click', clearChat);

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
      msg.raw += evt.content;
      schedulePaint(msg);
    } else if (evt.type === 'error') {
      msg.el.classList.add('error');
      msg.raw += '\n\n[出错了] ' + (evt.message || '未知错误');
      schedulePaint(msg);
    }
  }

  function sendMessage(text) {
    addMessage('user', text);          // 用户消息立即落盘（addMessage 内已写 sessionStorage）
    var msg = addStreamBubble();
    activeStream = msg;
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
        if (!msg.raw.trim()) msg.raw = '（大肥鱼这次没说话，再问一次试试～）';
      });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') {
        msg.raw += '\n\n[已停止]';
      } else {
        msg.el.classList.add('error');
        msg.raw += '\n\n[连接失败] ' + (err && err.message ? err.message : err);
      }
    }).then(function () {
      if (paintFrame) { cancelAnimationFrame(paintFrame); paintFrame = null; }
      if (streamMsg === msg) streamMsg = null;
      paintBubble(msg);
      msg.el.classList.remove('is-stream');
      abortController = null;
      setBusy(false);
      scrollLog();
      if (activeStream === msg) activeStream = null;
      // 流式结束（正常/出错/被打断）才落盘：避免每个 token 都写一次 sessionStorage
      var role = msg.el.classList.contains('error') ? 'error' : 'bot';
      if (msg.flushed) {
        // 这轮回复已被 pagehide 抢先存成残稿，就地覆盖，避免历史里出现两条
        chatHistory[chatHistory.length - 1] = { role: role, text: msg.raw };
        saveHistory();
      } else {
        pushHistory(role, msg.raw);
      }
    });
  }

  /* 首次进入：优先恢复 sessionStorage 里的历史，没有才播欢迎语；
     面板的展开状态同样恢复，且恢复时不抢输入焦点。 */
  if (!restoreHistory()) addMessage('bot', GREETING);

  if (readChatOpen()) {
    chatOpen = true;
    panel.classList.add('is-open');
    placeChatPanel();
  }

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
