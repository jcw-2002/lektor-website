/*
 * 组件配置：模板 <script data-*> → 一份只读配置对象。
 *
 * 入口脚本是 ESM，document.currentScript 为 null，所以按 src 反查 <script>
 * 标签取 data-model / data-chat-api。
 *
 * 模型地址必须在这一步就解析成绝对地址：oml2d 是异步加载的，真正发请求时
 * 文档地址可能已经被 PJAX 的 pushState 改成了别的目录，相对路径会解析到
 * /blog/live2d/... 这种不存在的位置（控制台 404 + modelSize 崩溃）。
 * 此刻 document.baseURI 还是真实地址。
 */

const ENTRY_RE = /(?:^|\/)widget\.js(?:[?#]|$)/;

/* 兜底资源一律相对 config.js 自身解析，子目录部署也不用改模板 */
const DEFAULT_MODEL_URL = new URL('../dafeiyu/c_0120.model3.json', import.meta.url).href;
const LOCAL_LIB_URL = new URL('../oml2d.min.js', import.meta.url).href;

const CDN_LIB_URL = 'https://unpkg.com/oh-my-live2d@0.19.3/dist/index.min.js';

function findEntryScript() {
  const scripts = document.querySelectorAll('script[src]');
  for (let i = scripts.length - 1; i >= 0; i -= 1) {
    if (ENTRY_RE.test(scripts[i].getAttribute('src') || '')) return scripts[i];
  }
  return null;
}

function toAbsolute(url) {
  try {
    return new URL(url, document.baseURI).href;
  } catch (err) {
    return url;
  }
}

/* 本地预览（lektor server 跑在 5000 之类）时同源没有 /api/chat，POST 会被
   开发服务器回 405；自动指向本机启动的 FastAPI。线上仍是同源，由 Nginx 反代。 */
function defaultChatApi() {
  const host = location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (isLocal && location.port !== '8000') {
    return location.protocol + '//' + host + ':8000/api/chat';
  }
  return '/api/chat';
}

export function resolveConfig() {
  const entry = findEntryScript();
  const attr = (name) => (entry && entry.getAttribute(name)) || '';

  return {
    modelUrl: attr('data-model') ? toAbsolute(attr('data-model')) : DEFAULT_MODEL_URL,
    chatApi: attr('data-chat-api') || defaultChatApi(),
    // 优先本地托管（已随 assets 部署），失败再回退 CDN
    libSources: [LOCAL_LIB_URL, CDN_LIB_URL],
    aboutUrl: 'https://github.com/xkk6663/dsh-live2d-mao',

    keys: {
      dragOffset: 'oml2d-drag-offset',
      panelSize: 'oml2d-chat-size',
      thread: 'whale-agent-thread-id',
      history: 'oml2d-chat-history',
      open: 'oml2d-chat-open'
    },

    desktop: {
      stage: { width: 320, height: 450 },
      scale: 0.08,
      position: [-10, 10]
    },

    /* 窄屏：默认不加载模型（库走 mobileHidden 分支），点提示后运行时唤醒。
       尺寸/缩放按桌面宽度比例缩到一半左右（0.08 × 168/320 ≈ 0.042）。 */
    mobile: {
      display: false,
      stage: { width: 168, height: 220 },
      scale: 0.042,
      position: [-6, 6],
      breakpoint: 'screen and (max-width: 768px)'
    },

    chat: {
      greeting: '嗨～我是大肥鱼 🐳\n博客、技术或者随便聊聊，都可以问我！',
      maxHistory: 40   // 只留最近 40 条，防止 sessionStorage 超配额
    }
  };
}
