/*
 * 自定义菜单图标：聊天按钮用的是 <symbol> 雪碧图，菜单项只引用 id。
 */

const ICON_ID = 'oml2d-icon-chat';

const SPRITE_HTML =
  '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
  'style="position:absolute;width:0;height:0;overflow:hidden">' +
  '<symbol id="' + ICON_ID + '" viewBox="0 0 24 24">' +
  '<path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>' +
  '</symbol></svg>';

/** 聊天菜单项要引用的 symbol id */
export const CHAT_ICON_ID = ICON_ID;

export function mountMenuIcons() {
  if (document.getElementById(ICON_ID)) return;
  document.body.insertAdjacentHTML('beforeend', SPRITE_HTML);
}
