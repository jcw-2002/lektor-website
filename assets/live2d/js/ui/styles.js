/*
 * 样式装配：把各组件样式合并成一个 <style> 注入 <head>。
 * 样式必须在库初始化前就位，否则首帧会闪一下无样式的内容。
 */

import { stageStyle } from './style-stage.js';
import { chatStyle } from './style-chat.js';

const STYLE_ID = 'oml2d-styles';

export function mountStyles(config) {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = stageStyle(config) + chatStyle();
  document.head.appendChild(style);
}
