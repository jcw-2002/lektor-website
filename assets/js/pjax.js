/*
 * PJAX 局部无刷新跳转。
 *
 * 设计目标：
 *   - 站内切页只替换 <main id="pjax-container">、导航高亮（#pjax-nav）和 <title>；
 *   - body 不被重建，所以 Live2D（#oml2d-wrapper）与 AI 对话面板（#oml2d-chat）
 *     连同它们的事件监听、流式请求一起活下来；
 *   - 任何异常都退化成普通整页跳转，不影响可用性。
 *
 * 依赖：MoOx/pjax（本地 assets/js/vendor/pjax.min.js 优先，CDN 兜底）。
 */
(function () {
  'use strict';

  var CONTAINER_ID = 'pjax-container';
  var NAV_ID = 'pjax-nav';

  /*
   * 本地库地址由模板传入（站点 url_style = relative，子目录部署也能正确解析），
   * 取不到时退回站点根路径，再退回 CDN。
   */
  var current = document.currentScript;
  var LOCAL_LIB = current && current.getAttribute('data-lib');

  var LIB_SOURCES = [
    LOCAL_LIB || '/js/vendor/pjax.min.js',
    'https://cdn.jsdelivr.net/npm/pjax@0.2.8/pjax.min.js',
    'https://unpkg.com/pjax@0.2.8/pjax.min.js'
  ];

  /*
   * 只接管「普通站内页面链接」。下面这些一律走浏览器原生行为：
   *   - 页内锚点 / javascript: / mailto: / tel:
   *   - target（新窗口、指定 frame）
   *   - download 下载链接
   *   - Lektor 后台 /admin
   *   - data-pjax="false"（单条链接手动退出 PJAX）
   * 外链由 pjax 自己判断；图片/压缩包等文件直链由 guardClick() 在捕获阶段二次拦截。
   */
  var ELEMENTS = [
    'a[href]',
    ':not([href^="#"])',
    ':not([href^="javascript:"])',
    ':not([href^="mailto:"])',
    ':not([href^="tel:"])',
    ':not([target])',
    ':not([download])',
    ':not([href^="/admin"])',
    ':not([data-pjax="false"])'
  ].join('');

  // 指向静态文件的链接不能当 HTML 请求回来（img-wall 的图片、下载页的压缩包等）
  var FILE_RE = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|bmp|mp4|webm|mov|mp3|wav|m4a|ogg|flac|pdf|zip|rar|7z|gz|tgz|tar|exe|dmg|apk|iso|json|xml|txt|md|csv|xlsx?|docx?|pptx?|woff2?|ttf|eot|otf)$/i;

  var pjax = null;

  function on(el, type, fn, capture) {
    el.addEventListener(type, fn, !!capture);
  }

  function findAnchor(node) {
    while (node && node.nodeType === 1) {
      if (node.tagName === 'A' && node.hasAttribute('href')) return node;
      node = node.parentNode;
    }
    return null;
  }

  /*
   * 相对地址的坑（「点 W JC 回不到首页」就是它）。
   *
   * pjax 用 pushState 换地址栏，但 #pjax-container / #pjax-nav 之外的元素不会被替换：
   * 左上角的 <a class="navbar-brand" href="./">、页脚的 license/contact 都还是首页那份
   * HTML，而 href 是相对的，浏览器会按「新地址」重新解析 —— 从首页 ./ 切到 /blog/ 后，
   * 这个 ./ 就变成 /blog/ 了，于是点 W JC 只是把当前目录再打开一次，永远回不去。
   *
   * 站点 url_style = relative，靠模板改不干净（以后新增的固定链接还会踩），
   * 所以在初始化时把它们固化成绝对地址：此刻 a.href 已按正确的文档地址解析过了。
   */
  function freezeOutsideLinks() {
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      // 会被整块替换的区域交给新页面的 HTML，它们本来就是对的
      if (a.closest('#' + CONTAINER_ID) || a.closest('#' + NAV_ID)) continue;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') continue;      // 页内锚点
      if (typeof a.href !== 'string') continue;           // 排除 SVG <a>
      a.setAttribute('href', a.href);
    }
  }

  /*
   * 兜底的点击拦截（只针对 CSS 选择器表达不了的情况）。
   *
   * pjax 只判断「是否外链 / 是否同页锚点」，文件直链它照接，
   * 于是 <a href="/img/xxx.jpg"> 会被当成 HTML 请求、失败后再整页跳一次。
   * 这里在捕获阶段截断：pjax 的监听挂在 <a> 上，截断后浏览器走原生跳转；
   * stopPropagation 不阻止默认行为，所以看图/下载都正常。
   */
  function guardClick(e) {
    if (!pjax || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var a = findAnchor(e.target);
    if (!a) return;
    if (FILE_RE.test(a.pathname || '')) e.stopPropagation();
  }

  /* ---------- 切页后的重新初始化 ---------- */

  // body class 决定首页(poster)与普通页的排版，必须跟着换
  function syncBodyClass(container) {
    var next = container.getAttribute('data-bodyclass');
    if (!next) return;
    next = next.replace(/^\s+|\s+$/g, '');
    if (next && next !== document.body.className) document.body.className = next;
  }

  // 本站代码高亮由 Lektor 的 markdown-highlighter(Pygments) 在构建期完成，
  // 页面里没有需要重跑的客户端高亮；将来接入 Prism / highlight.js 会自动生效。
  function reinitHighlight(container) {
    try {
      if (window.Prism && typeof window.Prism.highlightAllUnder === 'function') {
        window.Prism.highlightAllUnder(container);
      } else if (window.hljs && typeof window.hljs.highlightAll === 'function') {
        window.hljs.highlightAll();
      }
    } catch (err) {
      console.warn('[pjax] 代码高亮重渲染失败：', err);
    }
  }

  // 数学公式：KaTeX auto-render 优先，其次 MathJax v3（当前站点都没用，接入后自动兼容）
  function reinitMath(container) {
    try {
      if (typeof window.renderMathInElement === 'function') {
        window.renderMathInElement(container, window.katexAutoRenderOptions || {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      } else if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
        window.MathJax.typesetPromise([container]).catch(function () {});
      }
    } catch (err) {
      console.warn('[pjax] 数学公式重渲染失败：', err);
    }
  }

  // 评论：Disqus 的 embed.js 是页面内联脚本，pjax 会重新执行；
  // 但它的 thread 需要按新 URL 重置，否则可能停留在上一篇文章。
  function reinitComments(container) {
    if (!container.querySelector('#disqus_thread')) return;
    if (!window.DISQUS || typeof window.DISQUS.reset !== 'function') return;
    if (typeof window.disqus_config !== 'function') return;
    try {
      window.DISQUS.reset({ reload: true, config: window.disqus_config });
    } catch (err) {
      console.warn('[pjax] Disqus 重置失败：', err);
    }
  }

  // Bootstrap 3 轮播只在 window load 时自动初始化一次；
  // 站点没有把 jQuery 暴露到 window，能拿到就补一次，拿不到就交给 data-api 的懒加载。
  function reinitCarousel(container) {
    if (!window.jQuery) return;
    try {
      window.jQuery(container).find('[data-ride="carousel"]').each(function () {
        window.jQuery(this).carousel();
      });
    } catch (err) {
      console.warn('[pjax] 轮播初始化失败：', err);
    }
  }

  // 移动端点链接后导航抽屉仍然展开，看起来像没跳页
  function collapseNav() {
    var nav = document.getElementById('navbar');
    if (!nav || !nav.classList.contains('in')) return;
    nav.classList.remove('in');
    nav.setAttribute('aria-expanded', 'false');
  }

  /*
   * pjax 只在初始化时给「当时已存在」的 <a> 绑事件（attach-link 是逐元素绑，不做委托）。
   * #pjax-container / #pjax-nav 被整块替换后，新的导航和正文链接就没有监听器了，
   * 点击会静默退化成整页刷新（Live2D 也跟着重建）。这里补绑一次。
   */
  function rebindLinks() {
    if (!pjax || typeof pjax.refresh !== 'function') return;
    var regions = [document.getElementById(CONTAINER_ID), document.getElementById(NAV_ID)];
    for (var i = 0; i < regions.length; i++) {
      if (regions[i]) pjax.refresh(regions[i]);
    }
  }

  /*
   * 切页后的重初始化。
   *
   * 这里不做 window.scrollTo：pjax 的 scrollTo: 0 已经负责「成功切页回顶部」，
   * 并且能正确区分三种情况 —— 带 #hash 时滚到锚点、前进/后退时恢复原有位置、
   * 请求失败时原地不动。自己再滚一次反而会在失败时把页面弹到顶部。
   */
  function handleComplete() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    syncBodyClass(container);
    reinitHighlight(container);
    reinitMath(container);
    reinitComments(container);
    reinitCarousel(container);
    collapseNav();
    rebindLinks();
  }

  /* ---------- 启动 ---------- */

  function initPjax() {
    if (pjax || !window.Pjax) return;
    if (!document.getElementById(CONTAINER_ID)) return; // 模板没接容器就不启用

    pjax = new window.Pjax({
      elements: ELEMENTS,
      // 必须包含 title；#pjax-nav 用来同步导航 active 高亮
      selectors: ['title', '#' + CONTAINER_ID, '#' + NAV_ID],
      // 默认会给请求加 ?t=时间戳，会把 cacheBust 参数带进地址栏，关掉
      cacheBust: false,
      // 切页后回到顶部；有 hash 时 pjax 会改滚到目标锚点
      scrollTo: 0,
      timeout: 15000,
      debug: false
    });

    // 必须早于任何 pushState：此刻文档地址还是真实地址，相对 href 才解析得对
    freezeOutsideLinks();

    on(document, 'click', guardClick, true);
    on(document, 'pjax:complete', handleComplete);
  }

  function loadLib(index) {
    if (index >= LIB_SOURCES.length) {
      console.warn('[pjax] 所有源均加载失败，已降级为普通整页跳转');
      return;
    }
    var script = document.createElement('script');
    script.src = LIB_SOURCES[index];
    script.async = true;
    script.onload = function () {
      if (window.Pjax) initPjax();
    };
    script.onerror = function () {
      if (script.parentNode) script.parentNode.removeChild(script);
      console.warn('[pjax] 加载失败，尝试下一个源：' + LIB_SOURCES[index]);
      loadLib(index + 1);
    };
    document.head.appendChild(script);
  }

  loadLib(0);
})();
