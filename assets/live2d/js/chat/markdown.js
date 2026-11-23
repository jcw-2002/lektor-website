/*
 * 极简 Markdown 渲染 + 装饰符号过滤。
 *
 * 全部是纯函数，不碰 DOM —— 视图只负责把返回值塞进 innerHTML。
 * 安全模型：先 escapeHtml 再拼标签，链接只放行 http(s)/mailto/站内/锚点。
 */

/* 只处理围栏代码块之外的正文，且不会破坏行首缩进/列表。
   模型爱吐 🫧 🐳 🌊 之类，界面里统一去掉。 */
const DECOR_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
const VARIATION_RE = /[\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

export function cleanText(text) {
  const lines = String(text == null ? '' : text).split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    if (/^\s{0,3}(?:`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
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

export function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
              .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeUrl(url) {
  return /^(?:https?:\/\/|mailto:|\/|#)/i.test(url) ? url : '#';
}

function inlineMd(str) {
  const stash = [];
  // 行内代码先占位，避免里面的 ** * 被继续解析
  let s = str.replace(/`([^`\n]+)`/g, function (_m, code) {
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
  return s.replace(/\u0000(\d+)\u0000/g, function (_m, idx) {
    return stash[Number(idx)];
  });
}

/* 列表按缩进还原层级，避免子项被拍平成同级 */
function parseListTree(entries) {
  const root = { indent: -1, children: [] };
  const stack = [root];

  entries.forEach(function (entry) {
    while (stack.length > 1 && entry.indent <= stack[stack.length - 1].indent) stack.pop();
    const node = {
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
  const ordered = nodes[0].ordered;
  const tag = ordered ? 'ol' : 'ul';
  const head = '<' + tag + (ordered && nodes[0].start !== 1 ? ' start="' + nodes[0].start + '"' : '') + '>';

  return head + nodes.map(function (node) {
    return '<li>' + inlineMd(escapeHtml(node.text)).replace(/\n/g, '<br>') +
           serializeList(node.children) + '</li>';
  }).join('') + '</' + tag + '>';
}

/* 表格：首行为表头，第二行为分隔行（调用方已判定），其余为数据行 */
function buildTable(rows) {
  function cells(row) {
    return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
      .map(function (cell) { return inlineMd(escapeHtml(cell.trim())); });
  }

  const head = cells(rows[0]);
  const body = rows.slice(2).map(function (row) {
    return '<tr>' + cells(row).map(function (cell) { return '<td>' + cell + '</td>'; })
      .join('') + '</tr>';
  });

  return '<table><thead><tr>' +
         head.map(function (cell) { return '<th>' + cell + '</th>'; }).join('') +
         '</tr></thead><tbody>' + body.join('') + '</tbody></table>';
}

export function mdToHtml(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块；流式输出尚未闭合时也先按代码块渲染
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/);
    if (fence) {
      const mark = fence[1].charAt(0);
      const size = fence[1].length;
      const lang = fence[2];
      const code = [];
      i += 1;
      while (i < lines.length) {
        const close = lines[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1].charAt(0) === mark && close[1].length >= size) {
          i += 1;
          break;
        }
        code.push(lines[i]);
        i += 1;
      }
      out.push('<pre>' + (lang ? '<span class="oml2d-lang">' + escapeHtml(lang) + '</span>' : '') +
               '<code>' + escapeHtml(code.join('\n')) + '</code></pre>');
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    const head = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (head) {
      const lv = Math.min(head[1].length + 2, 6);
      out.push('<h' + lv + '>' + inlineMd(escapeHtml(head[2].trim())) + '</h' + lv + '>');
      i += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      out.push('<blockquote>' + mdToHtml(quoted.join('\n')) + '</blockquote>');
      continue;
    }

    // 表格：首行含 |，次行是含 | 的分隔行
    if (line.indexOf('|') !== -1 && /-/.test(lines[i + 1] || '') &&
        (lines[i + 1] || '').indexOf('|') !== -1 &&
        /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) {
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) {
        rows.push(lines[i]);
        i += 1;
      }
      out.push(buildTable(rows));
      continue;
    }

    const item = line.match(/^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(\S.*)$/);
    if (item) {
      const entries = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(\S.*)$/);
        if (!m) break;

        let text = m[4];
        const indent = m[1].replace(/\t/g, '    ').length;
        const isOrdered = !!m[3];
        i += 1;
        while (i < lines.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) &&
               !/^\s*(?:[-*+]|\d{1,3}[.)])\s+/.test(lines[i])) {
          text += '\n' + lines[i].trim();
          i += 1;
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

    const para = [];
    while (i < lines.length && lines[i].trim() &&
           !/^\s{0,3}(?:#{1,6}\s|>|`{3,}|~{3,})/.test(lines[i]) &&
           !/^\s*(?:[-*+]|\d{1,3}[.)])\s+/.test(lines[i]) &&
           !/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (!para.length) {
      para.push(lines[i].replace(/^\s+/, ''));
      i += 1;
    }
    out.push('<p>' + inlineMd(escapeHtml(para.join('\n'))).replace(/\n/g, '<br>') + '</p>');
  }

  return out.join('');
}
