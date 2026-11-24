/*
 * 聊天面板的几何：初始摆放、拖动、缩放、边界收拢。
 *
 * 面板固定在 body 上，坐标就是视口坐标。没被用户拖过时自动贴住模型舞台
 * （模型在哪半边，面板就贴到另一侧，底部与模型对齐）；拖过之后只做边界
 * 收拢，不再跟模型跑。尺寸写进 localStorage。
 */

import { clampNum, localStore } from '../util.js';

/* 默认尺寸 16:9（512×288）。已有用户本地拖过大小的话以 localStorage 里的为准，
   想回到这个默认值需要先清掉 oml2d-chat-size（config.keys.panelSize）。 */
const DEFAULT_SIZE = { w: 512, h: 288 };
const MIN_SIZE = { w: 260, h: 240 };
const EDGE = 8;        // 拖动/缩放时的最小留边
const MARGIN = 12;     // 自动摆放时的留边
const GAP = 12;        // 面板与模型之间的缝
const NARROW_WIDTH = 720;

export function createPanelLayout({ panel, head, sizeKey }) {
  let size = readSize();
  let dragged = false;
  let dragState = null;
  let resizeState = null;

  function readSize() {
    const saved = localStore.getJSON(sizeKey, null);
    if (saved && typeof saved.w === 'number' && typeof saved.h === 'number') {
      return { w: saved.w, h: saved.h };
    }
    return { w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
  }

  function saveSize() {
    localStore.setJSON(sizeKey, size);
  }

  /* 尺寸收拢到视口内后写进样式；窗口变小也不会把面板撑出屏幕 */
  function applySize() {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const maxW = vw - 16;
    const maxH = vh - 16;
    size.w = clampNum(size.w, Math.min(MIN_SIZE.w, maxW), Math.max(MIN_SIZE.w, maxW));
    size.h = clampNum(size.h, Math.min(MIN_SIZE.h, maxH), Math.max(MIN_SIZE.h, maxH));
    panel.style.width = size.w + 'px';
    panel.style.height = size.h + 'px';
  }

  /* 依据模型舞台的位置把面板贴到旁边 */
  function positionBesideStage() {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    // 窄屏：面板贴底，左右留边，不参与自定义尺寸
    if (vw <= NARROW_WIDTH) {
      const height = Math.min(Math.round(vh * 0.52), 380);
      panel.style.width = (vw - MARGIN * 2) + 'px';
      panel.style.height = height + 'px';
      panel.style.left = MARGIN + 'px';
      panel.style.top = Math.max(MARGIN, vh - MARGIN - height) + 'px';
      return;
    }

    applySize();
    const w = size.w;
    const h = size.h;

    const stage = document.getElementById('oml2d-stage');
    if (!stage) {
      // 模型尚未创建：先放右下角
      panel.style.left = (vw - w - MARGIN) + 'px';
      panel.style.top = (vh - h - MARGIN) + 'px';
      return;
    }

    const rect = stage.getBoundingClientRect();
    // 模型在哪半边，面板就贴到另一侧，底部与模型对齐
    const toRight = rect.left + rect.width / 2 < vw / 2;
    const left = clampNum(toRight ? rect.right + GAP : rect.left - w - GAP,
                          MARGIN, vw - w - MARGIN);
    const top = clampNum(rect.bottom - h, MARGIN, vh - h - MARGIN);

    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  /* 拖动过之后只做边界收拢，不再自动贴模型 */
  function clampPosition() {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = panel.offsetWidth || DEFAULT_SIZE.w;
    const h = panel.offsetHeight || DEFAULT_SIZE.h;
    const left = clampNum(parseFloat(panel.style.left) || 0, EDGE, vw - w - EDGE);
    const top = clampNum(parseFloat(panel.style.top) || 0, EDGE, vh - h - EDGE);
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  function place() {
    const narrow = document.documentElement.clientWidth <= NARROW_WIDTH;
    if (dragged && !narrow) clampPosition();
    else positionBesideStage();
  }

  /* ---------- 拖动：按住头部独立移动，不影响 Live2D 位置 ---------- */

  head.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    if (event.target.closest('#oml2d-chat-close, #oml2d-chat-clear')) return;

    const rect = panel.getBoundingClientRect();
    dragState = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    panel.classList.add('is-dragging');
    event.preventDefault();
  });

  /* ---------- 缩放：拖右边缘改宽、下边缘改高、右下角同时改 ---------- */

  panel.querySelectorAll('.oml2d-chat-resize').forEach(function (handle) {
    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;

      const rect = panel.getBoundingClientRect();
      resizeState = {
        dir: handle.getAttribute('data-dir'),
        x: event.clientX,
        y: event.clientY,
        w: rect.width,
        h: rect.height,
        left: rect.left,
        top: rect.top
      };
      panel.classList.add('is-resizing');
      event.preventDefault();
      event.stopPropagation();
    });
  });

  document.addEventListener('pointermove', function (event) {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    if (dragState) {
      const left = clampNum(dragState.left + (event.clientX - dragState.x),
                            EDGE, vw - panel.offsetWidth - EDGE);
      const top = clampNum(dragState.top + (event.clientY - dragState.y),
                           EDGE, vh - panel.offsetHeight - EDGE);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      return;
    }

    if (!resizeState) return;
    const dir = resizeState.dir;

    if (dir.indexOf('e') !== -1) {
      // 向右拉宽，不能超出视口右边界
      const maxW = Math.max(MIN_SIZE.w, vw - resizeState.left - EDGE);
      size.w = clampNum(resizeState.w + (event.clientX - resizeState.x), MIN_SIZE.w, maxW);
      panel.style.width = size.w + 'px';
    }
    if (dir.indexOf('s') !== -1) {
      const maxH = Math.max(MIN_SIZE.h, vh - resizeState.top - EDGE);
      size.h = clampNum(resizeState.h + (event.clientY - resizeState.y), MIN_SIZE.h, maxH);
      panel.style.height = size.h + 'px';
    }
  });

  document.addEventListener('pointerup', function () {
    if (dragState) {
      dragState = null;
      dragged = true;
      panel.classList.remove('is-dragging');
    }
    if (resizeState) {
      resizeState = null;
      panel.classList.remove('is-resizing');
      saveSize();
      clampPosition();
    }
  });

  document.addEventListener('pointercancel', function () {
    dragState = null;
    resizeState = null;
    panel.classList.remove('is-dragging');
    panel.classList.remove('is-resizing');
  });

  return { place };
}
