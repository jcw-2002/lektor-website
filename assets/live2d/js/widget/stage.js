/*
 * 舞台容器 + 整体拖拽。
 *
 * 舞台、状态条、菜单、提示框都挂在同一个 wrapper 里，拖的是 wrapper 的
 * transform，而不是模型本身；聊天面板刻意不在 wrapper 内，拖模型时不会被带着走。
 * 位置写进 localStorage，双击复位。
 */

import { clampNum, localStore } from '../util.js';

const KEEP_VISIBLE = 60;   // 任何情况下至少留 60px 在视口内

export function createStage(config) {
  const element = document.createElement('div');
  element.id = 'oml2d-wrapper';
  element.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;' +
                          'pointer-events:none;z-index:9999;';
  document.body.appendChild(element);

  let offset = readOffset();
  let dragStart = null;

  function readOffset() {
    const saved = localStore.getJSON(config.keys.dragOffset, null);
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      return { x: saved.x, y: saved.y };
    }
    return { x: 0, y: 0 };
  }

  function saveOffset() {
    localStore.setJSON(config.keys.dragOffset, offset);
  }

  /* 拖拽范围收拢：始终让模型至少有 KEEP_VISIBLE 留在视口内。
     手机上也一样 —— 位置会写进 localStorage，拖丢了下回打开就找不到了。 */
  function clampOffset() {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const stage = document.getElementById('oml2d-stage');
    const w = (stage && stage.offsetWidth) || 0;
    const h = (stage && stage.offsetHeight) || 0;
    if (!w || !h) return;

    offset.x = clampNum(offset.x, KEEP_VISIBLE - w, vw - KEEP_VISIBLE);
    offset.y = clampNum(offset.y, KEEP_VISIBLE - h, vh - KEEP_VISIBLE);
  }

  function applyOffset() {
    clampOffset();
    element.style.transform = (offset.x || offset.y)
      ? 'translate(' + offset.x + 'px, ' + offset.y + 'px)'
      : 'none';
  }

  function resetOffset() {
    offset = { x: 0, y: 0 };
    applyOffset();
    localStore.remove(config.keys.dragOffset);
  }

  /* 菜单是按钮区，不算拖拽热区 */
  function isDragArea(target) {
    if (target.closest('#oml2d-menus')) return false;
    return !!target.closest('#oml2d-stage, #oml2d-statusBar');
  }

  function endDrag() {
    if (!dragStart) return;
    dragStart = null;
    element.classList.remove('is-dragging');
    saveOffset();
  }

  element.addEventListener('pointerdown', function (event) {
    if (event.button !== 0 || !isDragArea(event.target)) return;
    dragStart = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    element.classList.add('is-dragging');
  });

  document.addEventListener('pointermove', function (event) {
    if (!dragStart) return;
    offset.x = dragStart.ox + event.clientX - dragStart.x;
    offset.y = dragStart.oy + event.clientY - dragStart.y;
    applyOffset();
  });

  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', function () {
    dragStart = null;
    element.classList.remove('is-dragging');
  });

  element.addEventListener('dblclick', function (event) {
    if (isDragArea(event.target)) resetOffset();
  });

  applyOffset();

  return { element, applyOffset, resetOffset };
}
