---
title: 页面底部添加语句
categories:               #分类
- 博客
tags: 
  - hexo
  - 安知鱼主题美化
cover: img/article/di_s_compressed.jpg
date: 2025-06-01 12:00:00
---

为 Hexo 安知鱼主题添加一个优雅的底部语句功能，支持自动刷新、手动复制和自定义语句管理。

## 功能特性

- 🎯 固定底部显示随机语句
- 🔄 每10秒自动刷新语句
- 📋 左键点击复制语句到剪贴板
- 🔃 右键点击手动刷新语句
- 📝 支持从JSON文件动态加载语句
- 🎨 完美适配安知鱼主题样式
- 📱 响应式设计，移动端友好

## 安装步骤

### 1. 创建 JavaScript 文件

在 `source/custom/js/` 目录下创建 `random-quote.js` 文件：

```javascript
document.addEventListener('DOMContentLoaded', function() {
    // 预定义语句数组（作为fallback）
    const fallbackQuotes = [
        "生活不是等待暴风雨过去，而是要学会在雨中跳舞。",
        "每一个不曾起舞的日子，都是对生命的辜负。",
        "世界上最遥远的距离，不是生与死，而是我站在你面前，你却不知道我爱你。",
        "人生如逆旅，我亦是行人。",
        "山有木兮木有枝，心悦君兮君不知。",
        "落红不是无情物，化作春泥更护花。",
        "海内存知己，天涯若比邻。",
        "路漫漫其修远兮，吾将上下而求索。",
        "不是每一次努力都会有收获，但是每一次收获都必须努力。",
        "愿你走出半生，归来仍是少年。"
    ];

    let quotes = fallbackQuotes;
    let autoRefreshInterval = null;
    let currentQuoteText = '';

    // 从JSON文件加载语句
    async function loadQuotesFromFile() {
        try {
            const response = await fetch('/sentence/quotes.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.quotes && Array.isArray(data.quotes) && data.quotes.length > 0) {
                quotes = data.quotes;
                console.log(`成功加载 ${quotes.length} 条语句`);
            } else {
                console.warn('JSON文件格式不正确或无有效语句，使用默认语句');
            }
        } catch (error) {
            console.warn('加载语句文件失败，使用默认语句:', error);
        }
    }

    function getRandomQuote() {
        const randomIndex = Math.floor(Math.random() * quotes.length);
        currentQuoteText = quotes[randomIndex];
        return `「 ${currentQuoteText} 」`;
    }

    function updateQuote(quoteElement) {
        quoteElement.style.opacity = '0.6';
        setTimeout(() => {
            quoteElement.textContent = getRandomQuote();
            quoteElement.style.opacity = '1';
        }, 150);
    }

    // 复制到剪贴板
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            return success;
        }
    }

    // 显示复制反馈
    function showCopyFeedback(element) {
        const originalTitle = element.title;
        element.title = '已复制到剪贴板！';
        element.style.color = 'var(--anzhiyu-green, #4CAF50)';
        
        setTimeout(() => {
            element.title = originalTitle;
            element.style.color = '';
        }, 1500);
    }

    function startAutoRefresh(quoteElement) {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
        
        autoRefreshInterval = setInterval(() => {
            updateQuote(quoteElement);
        }, 10000);
    }

    function createQuoteContainer() {
        if (document.getElementById('fixed-quote-container')) {
            return;
        }

        const container = document.createElement('div');
        container.id = 'fixed-quote-container';
        
        const quoteText = document.createElement('div');
        quoteText.id = 'random-quote';
        quoteText.className = 'random-quote-text';
        quoteText.textContent = getRandomQuote();
        quoteText.title = '点击复制语句 | 每10秒自动刷新';
        
        container.appendChild(quoteText);
        document.body.appendChild(container);

        // 左键复制
        quoteText.addEventListener('click', async function() {
            const success = await copyToClipboard(currentQuoteText);
            if (success) {
                showCopyFeedback(this);
            }
        });

        // 右键刷新
        quoteText.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            updateQuote(this);
            startAutoRefresh(this);
        });

        startAutoRefresh(quoteText);
    }

    // 初始化
    loadQuotesFromFile().then(() => {
        createQuoteContainer();
    });

    // PJAX 兼容
    if (typeof pjax !== 'undefined') {
        document.addEventListener('pjax:complete', () => {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
            
            loadQuotesFromFile().then(() => {
                createQuoteContainer();
            });
        });
    }

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
    });
});
```

### 2. 创建 CSS 样式文件

在 `source/custom/css/` 目录下创建 `random-quote.css` 文件：

```css
#fixed-quote-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: linear-gradient(135deg, var(--anzhiyu-main, #425AEF), var(--anzhiyu-main-op, rgba(66, 90, 239, 0.1)));
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--anzhiyu-card-border, rgba(255, 255, 255, 0.1));
  padding: 8px 20px;
  text-align: center;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.random-quote-text {
  color: var(--anzhiyu-fontcolor, #333);
  font-size: 14px;
  font-style: italic;
  margin: 0;
  padding: 0;
  transition: all 0.3s ease;
  cursor: pointer;
  line-height: 1.5;
  user-select: none;
  position: relative;
}

.random-quote-text:hover {
  color: var(--anzhiyu-white, #fff);
  transform: scale(1.02);
}

.random-quote-text:active {
  transform: scale(0.98);
}

.random-quote-text:hover::after {
  content: '点击左键复制，点击右键刷新';
  position: absolute;
  top: -35px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-style: normal;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  animation: fadeInUp 0.3s ease forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

body {
  padding-bottom: 50px !important;
}

[data-theme="dark"] #fixed-quote-container {
  background: linear-gradient(135deg, var(--anzhiyu-main, #425AEF), rgba(66, 90, 239, 0.2));
  border-top-color: var(--anzhiyu-card-border, rgba(255, 255, 255, 0.1));
}

@media screen and (max-width: 768px) {
  #fixed-quote-container {
    padding: 6px 15px;
  }
  
  .random-quote-text {
    font-size: 12px;
    line-height: 1.4;
  }
  
  body {
    padding-bottom: 45px !important;
  }
}
```

### 3. 创建语句数据文件

在 `source/sentence/` 目录下创建 `quotes.json` 文件：

```json
{
  "quotes": [
    "遇事不决，可问春风，春风不语，既随本心。",
    "难道是因为当初有话没讲完，堵在喉咙里却始终不敢大声喊。",
    "我大抵是病了，明明太阳照射到地球上有那么大的面积，我却时常关注那些灰暗阴沉的角落。",
    "情话和关心像传单一样乱发，暧昧也和破烂一样廉价。",
    "山有木兮木有枝，心悦君兮君不知。",
    "我渐渐学会了向前看，慢慢的不再是个念旧的人。",
    "怀疑一旦产生，罪名就已经成立。",
    "就像手指着月亮，不要把注意力放在手指上，否则你将会错过所有月亮的光华。",
    "人各不同，所以我才是我，人才是人。",
    "染于苍则苍，染于黄则黄。所入者变，其色亦变。"
  ]
}
```

### 4. 配置主题文件

在主题配置文件 `_config.anzhiyu.yml` 中添加引用：

```yaml
inject:
  head:
    - <link rel="stylesheet" href="/custom/css/random-quote.css" media="defer" onload="this.media='all'">
  bottom:
    - <script src="/custom/js/random-quote.js"></script>
```

## 使用说明

### 基本操作

- **自动刷新**：语句每10秒自动更新
- **手动复制**：左键点击语句复制到剪贴板（不含装饰符号）
- **手动刷新**：右键点击语句立即刷新
- **视觉反馈**：鼠标悬停显示操作提示

### 自定义语句

编辑 `source/sentence/quotes.json` 文件，在 `quotes` 数组中添加、删除或修改语句：

```json
{
  "quotes": [
    "你的自定义语句1",
    "你的自定义语句2",
    "..."
  ]
}
```

修改后重新生成站点即可生效。

### 样式自定义

可以通过修改 CSS 文件中的变量来调整样式：

- 调整位置：修改 `bottom`、`left`、`right` 属性
- 调整颜色：使用安知鱼主题变量或自定义颜色
- 调整字体：修改 `font-size`、`font-style` 等属性

## 注意事项

1. 确保 `source/custom/` 和 `source/sentence/` 目录存在
2. JSON 文件格式必须正确，注意逗号和引号
3. 如果加载外部文件失败，会自动使用内置的默认语句
4. 支持 PJAX，页面切换时会自动重新初始化

## 效果预览

安装完成后，你会在页面底部看到一个优雅的语句栏，语句格式为：

```
「 你的语句内容 」
```

功能完整，体验流畅，完美融入安知鱼主题的设计风格。

## 故障排除

- **语句不显示**：检查 JavaScript 文件路径和语法
- **样式异常**：检查 CSS 文件路径和主题兼容性
- **语句不更新**：检查 JSON 文件格式和网络访问
- **复制失败**：检查浏览器兼容性和权限设置
