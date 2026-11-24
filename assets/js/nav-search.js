/*
 * 导航栏全站搜索（Pagefind JS API）。
 *
 * 交互：输入关键词后，结果以列表框的形式直接展开在搜索框下方，点条目跳转到对应页面，
 *       不再有独立的搜索页。
 *
 * 几个关键点：
 *   - 索引来自构建期的 /pagefind/，pagefind.js 只在首次聚焦/输入时动态 import，
 *     首屏不加载索引，也不影响任何现有功能；
 *   - 输入框放在 <nav> 里、#pjax-nav 之外，PJAX 切页不会重建它，所以这里只初始化一次；
 *     切页完成（pjax:complete）时把上一次残留的下拉收起；
 *   - 索引不存在时（例如 lektor server 本地开发、没跑 pagefind）只提示一次，
 *     不抛异常、不阻塞页面其他脚本。
 */
(function () {
  'use strict';

  var root = document.getElementById('navbar-search');
  if (!root) return;

  var input = root.querySelector('.navbar-search-input');
  var panel = root.querySelector('.navbar-search-results');
  if (!input || !panel) return;

  var bundle = root.getAttribute('data-bundle') || '/pagefind/';
  if (bundle.charAt(bundle.length - 1) !== '/') bundle += '/';

  var MAX_RESULTS = 6;   // 下拉里最多展示几条
  var DEBOUNCE = 220;    // 输入防抖（毫秒）

  var pagefind = null;   // 加载成功后的模块
  var loading = null;    // 进行中的 import
  var failed = false;    // 索引不可用，本次会话不再重试
  var timer = null;
  var seq = 0;           // 请求序号，用于丢弃过期结果

  function openPanel() {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    panel.hidden = true;
    panel.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
  }

  function message(text) {
    var li = document.createElement('li');
    li.className = 'navbar-search-empty';
    li.textContent = text;
    panel.innerHTML = '';
    panel.appendChild(li);
    openPanel();
  }

  function load() {
    if (pagefind) return Promise.resolve(pagefind);
    if (failed) return Promise.reject(new Error('unavailable'));
    if (loading) return loading;

    loading = import(bundle + 'pagefind.js').then(function (mod) {
      pagefind = mod;
      return mod;
    }).catch(function (err) {
      failed = true;
      loading = null;
      throw err;
    });
    return loading;
  }

  function render(items) {
    panel.innerHTML = '';

    if (!items.length) {
      message('没有找到相关内容');
      return;
    }

    items.forEach(function (data) {
      var li = document.createElement('li');
      var a = document.createElement('a');

      var href = data.url;
      if (href.charAt(0) !== '/' && !/^[a-z]+:/i.test(href)) href = '/' + href;

      a.className = 'navbar-search-item';
      a.href = href;

      var title = document.createElement('span');
      title.className = 'navbar-search-title';
      title.textContent = (data.meta && data.meta.title) || data.url;
      a.appendChild(title);

      if (data.excerpt) {
        var excerpt = document.createElement('span');
        excerpt.className = 'navbar-search-excerpt';
        // Pagefind 生成的摘要只含 <mark> 高亮，正文内容已由它转义
        excerpt.innerHTML = data.excerpt;
        a.appendChild(excerpt);
      }

      li.appendChild(a);
      panel.appendChild(li);
    });

    openPanel();
  }

  function search() {
    var term = input.value.trim();
    if (!term) {
      closePanel();
      return;
    }

    var token = ++seq;

    load().then(function (pf) {
      return pf.search(term);
    }).then(function (res) {
      if (token !== seq) return;          // 期间又输入了新内容
      var top = res.results.slice(0, MAX_RESULTS);
      return Promise.all(top.map(function (r) { return r.data(); }))
        .then(function (items) {
          if (token !== seq) return;
          render(items);
        });
    }).catch(function (err) {
      if (token !== seq) return;
      if (err && err.message === 'unavailable') {
        message('搜索索引不可用：请先构建并生成 pagefind 索引');
      } else {
        console.warn('[nav-search] 搜索失败：', err);
        message('搜索暂时不可用');
      }
    });
  }

  // 聚焦时预热索引（用户真正输入前就开始加载）
  input.addEventListener('focus', function () {
    load().catch(function () {});
  });

  input.addEventListener('input', function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(search, DEBOUNCE);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closePanel();
      input.blur();
    } else if (e.key === 'Enter') {
      var first = panel.querySelector('a');
      if (first) {
        e.preventDefault();
        first.click();
      }
    }
  });

  // 点空白处收起下拉
  document.addEventListener('click', function (e) {
    if (!root.contains(e.target)) closePanel();
  });

  // 站内 PJAX 切页后，收起上一页遗留的下拉
  document.addEventListener('pjax:complete', closePanel);
})();
