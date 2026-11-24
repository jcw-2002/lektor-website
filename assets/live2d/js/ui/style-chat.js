/*
 * 大肥鱼聊天面板样式：单色极简风，面板挂在 body 上，可拖动、可缩放。
 * 同时包含气泡内的 Markdown 排版与流式光标动画。
 */

export function chatStyle() {
  return `
/* ===== 面板骨架 ===== */
#oml2d-chat { position:fixed; left:0; top:0; width:512px; height:288px;
  display:none; flex-direction:column; overflow:hidden; border-radius:8px;
  background:#fff; border:1px solid #e6e6e6; z-index:10000;
  box-shadow:0 4px 14px rgba(0,0,0,.07);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; font-size:14px; color:#333; }
#oml2d-chat.is-open { display:flex; }

/* ===== 缩放把手：右边缘、下边缘、右下角 ===== */
.oml2d-chat-resize { position:absolute; z-index:3; touch-action:none; }
.oml2d-resize-e { top:0; right:0; width:6px; height:100%; cursor:ew-resize; }
.oml2d-resize-s { left:0; bottom:0; height:6px; width:100%; cursor:ns-resize; }
.oml2d-resize-se { right:0; bottom:0; width:16px; height:16px; cursor:nwse-resize;
  border-bottom-right-radius:8px; }
.oml2d-resize-se::after { content:""; position:absolute; right:3px; bottom:3px;
  width:7px; height:7px; border-right:2px solid #d2d2d2; border-bottom:2px solid #d2d2d2;
  border-radius:0 0 2px 0; }
.oml2d-resize-se:hover::after { border-color:#1f1f1f; }
#oml2d-chat.is-resizing { user-select:none; }
#oml2d-chat.is-resizing #oml2d-chat-log { pointer-events:none; }

/* ===== 标题栏 ===== */
#oml2d-chat-head { display:flex; align-items:center; gap:8px; padding:10px 12px;
  background:#fafafa; border-bottom:1px solid #eee; color:#1f1f1f;
  cursor:grab; user-select:none; touch-action:none; }
#oml2d-chat.is-dragging #oml2d-chat-head { cursor:grabbing; }
.oml2d-chat-avatar { font-size:16px; line-height:1; }
.oml2d-chat-title { font-size:13px; font-weight:600; }
#oml2d-chat-close, #oml2d-chat-clear { border:0; background:transparent;
  color:#999; cursor:pointer; font-size:13px; line-height:1;
  width:22px; height:22px; border-radius:4px;
  display:flex; align-items:center; justify-content:center; }
#oml2d-chat-clear { margin-left:auto; width:auto; padding:0 6px; font-size:12px; }
#oml2d-chat-close:hover, #oml2d-chat-clear:hover { background:#f0f0f0; color:#333; }

/* ===== 消息列表 ===== */
#oml2d-chat-log { flex:1; min-height:0; overflow-y:auto; padding:12px;
  display:flex; flex-direction:column; gap:8px;
  scrollbar-width:thin; scrollbar-color:#d4d4d4 transparent; }
#oml2d-chat-log::-webkit-scrollbar { width:5px; }
#oml2d-chat-log::-webkit-scrollbar-thumb { background:#d4d4d4; border-radius:3px; }
#oml2d-chat-log::-webkit-scrollbar-track { background:transparent; }
.oml2d-msg { max-width:88%; padding:8px 12px; border-radius:10px;
  word-break:break-word; font-size:13px; line-height:1.65; }
.oml2d-msg.user { align-self:flex-end; background:#1f1f1f; color:#fff;
  white-space:pre-wrap; border-bottom-right-radius:3px; }
.oml2d-msg.bot { align-self:flex-start; background:#f8f8f9; color:#2b2b2b;
  border:1px solid #ededee; border-bottom-left-radius:3px; }
.oml2d-msg.error { background:#fff; color:#2b2b2b; border:1px solid #d8d8d8; }

/* ===== 气泡内的 Markdown 排版 ===== */
.oml2d-md > :first-child { margin-top:0; }
.oml2d-md > :last-child { margin-bottom:0; }
.oml2d-md p { margin:0 0 6px; }
.oml2d-md h1,.oml2d-md h2,.oml2d-md h3,.oml2d-md h4,.oml2d-md h5,.oml2d-md h6 {
  margin:10px 0 5px; font-size:13px; font-weight:600; line-height:1.45; }
.oml2d-md ul,.oml2d-md ol { margin:0 0 6px; padding-left:18px; }
.oml2d-md li { margin:2px 0; }
.oml2d-md li::marker { color:#9a9a9a; }
.oml2d-md strong { font-weight:600; color:#111; }
.oml2d-md del { color:#9a9a9a; }
.oml2d-md a { color:#1f1f1f; text-decoration:underline; text-underline-offset:2px;
  word-break:break-all; }
.oml2d-md code { font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  font-size:12px; background:#eaeaec; border-radius:3px; padding:1px 4px; }
.oml2d-md pre { margin:6px 0; padding:8px 10px; background:#eeeef0; border-radius:6px;
  overflow-x:auto; line-height:1.5; }
.oml2d-md pre code { display:block; padding:0; background:transparent;
  white-space:pre; font-size:12px; }
.oml2d-md blockquote { margin:6px 0; padding:2px 0 2px 8px;
  border-left:2px solid #dcdcdc; color:#666; }
.oml2d-md hr { border:0; border-top:1px solid #e4e4e4; margin:8px 0; }
.oml2d-md table { display:block; overflow-x:auto; margin:6px 0;
  border-collapse:collapse; font-size:12px; }
.oml2d-md th,.oml2d-md td { border:1px solid #e2e2e4; padding:4px 8px; text-align:left; }
.oml2d-md th { background:#ececee; font-weight:600; }
.oml2d-md .oml2d-lang { display:block; margin-bottom:4px; font-size:11px; color:#8c8c8c;
  font-family:ui-monospace,monospace; }

/* 流式输出时的光标：挂在最后一段的行尾 */
.oml2d-msg.is-stream .oml2d-md > :last-child::after { content:""; display:inline-block;
  width:6px; height:12px; margin-left:2px; vertical-align:-2px; background:#b0b0b0;
  animation:oml2d-blink 1s steps(1,end) infinite; }
@keyframes oml2d-blink { 50% { opacity:0; } }

/* ===== 输入区 ===== */
#oml2d-chat-form { display:flex; gap:8px; padding:10px;
  border-top:1px solid #eee; background:#fff; }
#oml2d-chat-input { flex:1; min-width:0; resize:none; height:36px; padding:8px 10px;
  border:1px solid #dcdcdc; border-radius:6px; outline:none;
  background:#fff; color:#333;
  font-family:inherit; font-size:13px; line-height:1.4; }
#oml2d-chat-input:focus { border-color:#1f1f1f; }
#oml2d-chat-input::placeholder { color:#a3a3a3; }
#oml2d-chat-send { flex:0 0 56px; border:0; border-radius:6px; cursor:pointer;
  background:#1f1f1f; color:#fff; font-family:inherit; font-size:13px; font-weight:500; }
#oml2d-chat-send:hover:not(:disabled) { background:#3d3d3d; }
#oml2d-chat-send:disabled { opacity:.45; cursor:not-allowed; }

@media (max-width:720px) {
  #oml2d-chat { border-radius:6px; }
  .oml2d-chat-resize { display:none; }
}
`;
}
