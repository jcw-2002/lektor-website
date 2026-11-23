/*
 * 看板娘舞台样式：容器、指针事件、舞台几何兜底、窄屏尺寸。
 */

export function stageStyle(config) {
  const mobile = config.mobile.stage;

  return `
/*
 * 只有真正可见的部件才接收指针事件。
 * 不能写成 '#oml2d-wrapper > * { pointer-events:auto; }' —— 舞台上那块空区域
 * 会吃掉点击，移动端的汉堡按钮就点不动了。
 */
#oml2d-wrapper > * { pointer-events:none; }
#oml2d-stage, #oml2d-canvas, #oml2d-menus, #oml2d-menus *, #oml2d-statusBar,
  #oml2d-statusBar *, #oml2d-tips { pointer-events:auto; }

/*
 * 舞台几何兜底。
 *
 * oh-my-live2d 在窄屏（<=768px）且 mobileDisplay=false 时走 mobileHidden 分支：
 * 只调用 slideOut() 设个动画，从不执行 reloadStyle()，于是 #oml2d-stage 上没有
 * position / width / height。它作为 wrapper 里的普通块级元素就贴在视口左上角，
 * 变成一条整宽的透明带（画布被 pixi 撑成 100% 宽、几十像素高），正好压住顶部
 * 导航栏，汉堡按钮的点击全被吞掉。
 *
 * 这里把舞台固定死在左下角并给出尺寸，无论库有没有写样式都不会再跑到顶部。
 */
#oml2d-stage { position:fixed !important; left:0 !important; top:auto !important;
  right:auto !important; bottom:0 !important; z-index:9997 !important;
  width:${config.desktop.stage.width}px !important;
  height:${config.desktop.stage.height}px !important;
  touch-action:none !important; cursor:grab !important; }
#oml2d-wrapper.is-dragging #oml2d-stage { cursor:grabbing !important; }

/*
 * 窄屏：模型缩到 ${mobile.width}×${mobile.height}，只有左下角这一小块可交互。
 * 舞台背景、气泡不接收指针事件，页面其余区域完全不受影响；
 * 画布（模型本体）保留 auto —— 这样才能拖动、点出菜单、打开聊天。
 */
@media (max-width: 768px) {
  #oml2d-stage { width:${mobile.width}px !important;
    height:${mobile.height}px !important; }
  #oml2d-stage, #oml2d-tips { pointer-events:none !important; }
  #oml2d-canvas { pointer-events:auto !important; }
}
`;
}
