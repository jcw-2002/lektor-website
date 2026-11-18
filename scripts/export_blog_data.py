#!/usr/bin/env python3
"""把 Lektor 源内容导出成「纯文本 + JSON」，供 whale_agent 的博客知识库使用。

设计要点：
- 只依赖 Python 标准库，Windows / Linux 均可直接运行；
- 直接解析 content/ 下的 .lr 源文件，不读取渲染后的 HTML（避免标签浪费 Token）；
- 正文以干净的 Markdown 落盘，索引（index.json）只保留标题、日期、链接、标签、摘要；
- 所有文件读写都显式使用 pathlib.Path 与 encoding="utf-8"，换行统一为 LF。

用法（在仓库根目录执行）：
    python scripts/export_blog_data.py
    python scripts/export_blog_data.py --output dist_blog_data --site-url https://wanjc.top
"""
from __future__ import annotations

import argparse
import configparser
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT: Path = Path(__file__).resolve().parents[1]
DEFAULT_CONTENT_DIR: Path = REPO_ROOT / "content"
DEFAULT_MODELS_DIR: Path = REPO_ROOT / "models"
DEFAULT_OUTPUT_DIR: Path = REPO_ROOT / "dist_blog_data"
DEFAULT_SITE_URL: str = "https://wanjc.top"
DEFAULT_SITE_TITLE: str = "W JC 的技术博客"
DEFAULT_SITE_OWNER: str = "W JC"

# 被视为「博客文章」的模型：section-page（Markdown 正文）、blog-post（Flow 正文）
ARTICLE_MODELS: tuple[str, ...] = ("section-page", "blog-post")
# 站点介绍页（不是文章，但需要支持全文读取）：page（关于/联系等）、poster（首页）
PAGE_MODELS: tuple[str, ...] = ("page", "poster")
PAGE_ROOT_TITLE: str = "首页个人简介"

SUMMARY_MAX_CHARS: int = 150
ABOUT_MAX_CHARS: int = 3000

# 顶层字段分隔线恰好是 3 个短横线；Flow 块内部字段用 4 个及以上
FIELD_SEPARATOR_RE = re.compile(r"^-{3}$")
FLOW_SEPARATOR_RE = re.compile(r"^-{4,}$")
BLOCK_HEADER_RE = re.compile(r"^####\s+(.+?)\s+####$")
FIELD_KEY_RE = re.compile(r"^([A-Za-z_][\w\-]*)\s*:(.*)$")
FENCE_RE = re.compile(r"```.*?```", re.S)
FENCED_CODE_RE = re.compile(r"^\s*```")
DATE_RE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")
HTML_TAG_RE = re.compile(
    r"</?(?:div|span|p|br|hr|img|a|ul|ol|li|table|thead|tbody|tr|td|th|"
    r"iframe|script|style|center|figure|figcaption|blockquote|h[1-6])\b[^>\n]{0,300}>",
    re.I,
)


# --------------------------------------------------------------------------- #
# 基础 IO
# --------------------------------------------------------------------------- #
def read_text(path: Path) -> str:
    """读取 UTF-8 文本并统一为 LF 换行，兼容 Windows 上保存的 CRLF 文件。"""
    text = path.read_text(encoding="utf-8")
    return text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")


def write_text(path: Path, content: str) -> None:
    """写出 UTF-8（无 BOM）+ LF 换行，保证 Linux 服务器上读取结果一致。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


# --------------------------------------------------------------------------- #
# .lr 解析
# --------------------------------------------------------------------------- #
def split_fields(text: str, separator_re: re.Pattern[str] = FIELD_SEPARATOR_RE) -> dict[str, str]:
    """把 .lr 文本切分为「字段名 -> 字段值」。

    容错处理：正文里如果出现裸的 `---` 分隔线，其后的片段首行不再是 `key:`，
    此时把该片段并回上一个字段，避免正文被截断。
    """
    segments: list[list[str]] = [[]]
    for line in text.split("\n"):
        if separator_re.match(line.strip()):
            segments.append([])
        else:
            segments[-1].append(line)

    values: dict[str, list[str]] = {}
    last_key: str | None = None
    for segment in segments:
        while segment and not segment[0].strip():
            segment.pop(0)
        if not segment:
            continue
        match = FIELD_KEY_RE.match(segment[0])
        if match is None:
            if last_key is not None:
                values[last_key].append("---")
                values[last_key].extend(segment)
            continue
        key = match.group(1)
        inline = match.group(2)
        body_lines = ([inline] if inline.strip() else []) + segment[1:]
        values[key] = body_lines
        last_key = key

    return {key: "\n".join(lines).strip("\n") for key, lines in values.items()}


def load_models(models_dir: Path) -> dict[str, dict[str, Any]]:
    """解析 models/*.ini，得到每个模型的字段类型、子模型与默认隐藏标记。"""
    models: dict[str, dict[str, Any]] = {}
    if not models_dir.is_dir():
        return models

    for ini_path in sorted(models_dir.glob("*.ini")):
        parser = configparser.ConfigParser(interpolation=None)
        try:
            parser.read_string(read_text(ini_path), source=str(ini_path))
        except (configparser.Error, OSError) as exc:  # 单个模型解析失败不影响整体导出
            print(f"[warn] 跳过无法解析的模型 {ini_path.name}: {exc}", file=sys.stderr)
            continue

        sections = parser.sections()
        fields = {
            section.split(".", 1)[1]: parser.get(section, "type", fallback="string").strip()
            for section in sections
            if section.startswith("fields.")
        }
        models[ini_path.stem] = {
            "name": parser.get("model", "name", fallback=ini_path.stem).strip(),
            "fields": fields,
            "children": parser.get("children", "model", fallback="").strip(),
            "hidden": parser.getboolean("model", "hidden", fallback=False),
        }
    return models


def iter_records(
    directory: Path,
    inherited_model: str,
    rel_parts: tuple[str, ...],
    models: dict[str, dict[str, Any]],
    content_dir: Path,
    records: list[dict[str, Any]],
) -> None:
    """递归遍历内容树，解析出每条记录的字段、模型与相对路径。"""
    model_id = inherited_model
    contents = directory / "contents.lr"
    if contents.is_file():
        fields = split_fields(read_text(contents))
        own_model = fields.get("_model", "").strip()
        if own_model:
            model_id = own_model
        records.append(
            {
                "dir": directory,
                "rel_parts": rel_parts,
                "model": model_id,
                "fields": fields,
            }
        )

    children_model = models.get(model_id, {}).get("children", "")
    for child in sorted(directory.iterdir()):
        if not child.is_dir():
            continue
        # Lektor 中下划线 / 点开头的内容目录不参与发布（如 content/_post）
        if child.name.startswith(("_", ".")):
            continue
        iter_records(child, children_model, rel_parts + (child.name,), models, content_dir, records)


# --------------------------------------------------------------------------- #
# 正文清洗
# --------------------------------------------------------------------------- #
def extract_flow_text(raw: str) -> str:
    """从 Flow 类型正文中抽出所有 text-block 的 Markdown 内容，丢弃 banner/图片块。"""
    blocks: list[tuple[str, list[str]]] = []
    current_name: str | None = None
    buffer: list[str] = []

    for line in raw.split("\n"):
        header = BLOCK_HEADER_RE.match(line.strip())
        if header is not None:
            if current_name is not None:
                blocks.append((current_name, buffer))
            current_name = header.group(1).strip().lower()
            buffer = []
        else:
            buffer.append(line)
    if current_name is not None:
        blocks.append((current_name, buffer))

    parts: list[str] = []
    for name, lines in blocks:
        if name not in {"text-block", "text block", "textblock"}:
            continue
        block_fields = split_fields("\n".join(lines), FLOW_SEPARATOR_RE)
        text = block_fields.get("text", "").strip("\n")
        if text.strip():
            parts.append(text)
    return "\n\n".join(parts)


def strip_html_outside_code(markdown: str) -> str:
    """移除常见 HTML 标签，代码块内保持原样。"""
    output: list[str] = []
    in_fence = False
    for line in markdown.split("\n"):
        if FENCED_CODE_RE.match(line):
            in_fence = not in_fence
            output.append(line)
            continue
        output.append(line if in_fence else HTML_TAG_RE.sub("", line))
    return "\n".join(output)


def cleanup_markdown(markdown: str) -> str:
    """把 Lektor 正文整理成干净、可直接喂给大模型的 Markdown。"""
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    # Lektor 的 Markdown 指令：[文字 :ref](url) -> [文字](url)
    text = re.sub(r"\s+:(?:ref|ext|class|r|sourcecode|js-[\w-]+)\b\]", "]", text)
    # 去掉图片（大模型看不到图片，只会浪费 Token），保留链接文字
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    # 去掉链接 / 图片的 title 部分：(url "title") -> (url)
    text = re.sub(r'\]\(\s*([^)\s]+)\s+"[^"]*"\s*\)', r"](\1)", text)
    text = strip_html_outside_code(text)
    lines = [line.rstrip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip("\n")


def plain_text(markdown: str) -> str:
    """把 Markdown 压成单段纯文本，用于生成摘要与字数统计。"""
    text = FENCE_RE.sub(" ", markdown)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"^\s{0,3}>\s?", "", text, flags=re.M)
    text = re.sub(r"^\s{0,3}[-*+]\s+", "", text, flags=re.M)
    text = re.sub(r"^\s{0,3}\d+\.\s+", "", text, flags=re.M)
    text = re.sub(r"<[^>\n]{1,200}>", " ", text)
    text = re.sub(r"[*_`~]+", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def clip_summary(text: str, limit: int = SUMMARY_MAX_CHARS) -> str:
    """截断到 limit 字以内，尽量在句末标点处收尾。"""
    text = text.strip()
    if len(text) <= limit:
        return text
    head = text[:limit]
    cut = max(head.rfind(mark) for mark in "。！？.!?；;")
    if cut >= limit - 40:
        head = head[: cut + 1]
    return head.rstrip("，,、；;：: ") + "…"


def normalize_date(raw: str) -> str:
    """统一成 YYYY-MM-DD；无法识别时原样返回。"""
    text = raw.strip().replace("/", "-")
    match = DATE_RE.match(text)
    if match is None:
        return text
    year, month, day = (int(part) for part in match.groups())
    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_tags(fields: dict[str, str]) -> list[str]:
    """标签优先取 tags 字段，其次用 category，最后用所属板块名兜底。"""
    tags: list[str] = []
    for key in ("tags", "_tags"):
        raw = fields.get(key, "").strip()
        if raw:
            tags.extend(part.strip() for part in re.split(r"[,，、;；|]+", raw) if part.strip())
    return tags


# 栏目根页面没有 title 时的兜底中文名（按目录名映射，仅用于提示词可读性）
SECTION_LABELS: dict[str, str] = {
    "program": "编程",
    "blog": "博客",
    "update": "网站改动",
    "quotes": "语录",
    "web": "收藏夹",
    "gallery": "相册",
    "img": "图片",
    "docs": "文档",
    "plugins": "插件",
    "plugin-categories": "插件分类",
    "showcase": "案例展示",
    "about": "关于",
    "contact": "联系",
    "links": "友链",
    "downloads": "下载",
    "license": "许可",
}


def section_label(dir_name: str, fields: dict[str, str]) -> str:
    """栏目名：优先 title，其次 name，再退回目录名映射。"""
    name = plain_text(fields.get("title", "") or fields.get("name", ""))
    if name:
        return name
    return SECTION_LABELS.get(dir_name, dir_name)


def collect_section_titles(records: list[dict[str, Any]]) -> dict[str, str]:
    """收集第一层栏目名，用于给文章补 section 字段与兜底标签。"""
    titles: dict[str, str] = {}
    for record in records:
        parts: tuple[str, ...] = record["rel_parts"]
        if len(parts) != 1 or parts[0] in titles:
            continue
        name = section_label(parts[0], record["fields"])
        if name:
            titles[parts[0]] = name
    return titles


def is_excluded(fields: dict[str, str]) -> bool:
    """过滤草稿与隐藏页。"""
    for key in ("_hidden", "_discoverable"):
        value = fields.get(key, "").strip().lower()
        if key == "_hidden" and value in {"yes", "true", "1"}:
            return True
        if key == "_discoverable" and value in {"no", "false", "0"}:
            return True
    for key in ("draft", "_draft"):
        if fields.get(key, "").strip().lower() in {"yes", "true", "1"}:
            return True
    if fields.get("published", "").strip().lower() in {"no", "false", "0"}:
        return True
    return False


# --------------------------------------------------------------------------- #
# 记录 -> 导出结构
# --------------------------------------------------------------------------- #
def url_for(rel_parts: tuple[str, ...], fields: dict[str, str], site_url: str) -> str:
    """按 Lektor 默认路由（目录路径）生成绝对 URL，支持 _slug 覆盖。"""
    slug = fields.get("_slug", "").strip().strip("/")
    if slug:
        parts = slug.split("/")
    else:
        parts = list(rel_parts)
    path = "/".join(part for part in parts if part)
    return f"{site_url}/{path}/" if path else f"{site_url}/"


def slug_for(rel_parts: tuple[str, ...], fields: dict[str, str]) -> str:
    slug = fields.get("_slug", "").strip().strip("/")
    if slug:
        return slug
    return "/".join(rel_parts)


def slug_to_filename(slug: str) -> str:
    """把 slug 映射成扁平文件名，便于 posts/ 与 pages/ 目录管理。"""
    name = slug.replace("/", "__")
    name = re.sub(r"[^\w\u4e00-\u9fff\-]+", "-", name).strip("-")
    return f"{name or 'index'}.md"


def build_post(
    record: dict[str, Any],
    models: dict[str, dict[str, Any]],
    site_url: str,
    section_titles: dict[str, str],
) -> dict[str, Any] | None:
    """把一条文章记录转换成索引条目；不满足条件时返回 None。"""
    fields: dict[str, str] = record["fields"]
    model_id: str = record["model"]
    if model_id not in ARTICLE_MODELS or is_excluded(fields):
        return None

    title = plain_text(fields.get("title", ""))
    if not title:
        return None

    body_type = models.get(model_id, {}).get("fields", {}).get("body", "flow")
    raw_body = fields.get("body", "")
    extracted = extract_flow_text(raw_body) if body_type == "flow" else raw_body
    body = cleanup_markdown(extracted)
    if not body.strip():
        return None

    slug = slug_for(record["rel_parts"], fields)
    flat = plain_text(body)
    summary = clip_summary(plain_text(fields.get("summary", "")) or flat)

    section = section_titles.get(slug.split("/")[0], "")
    tags = parse_tags(fields)
    category = fields.get("category", "").strip()
    for extra in (category, section):
        if extra and extra not in tags:
            tags.append(extra)

    return {
        "slug": slug,
        "title": title,
        "date": normalize_date(fields.get("pub_date", "")),
        "url": url_for(record["rel_parts"], fields, site_url),
        "tags": tags,
        "summary": summary,
        "category": category,
        "section": section,
        "author": fields.get("author", "").strip(),
        "file": f"posts/{slug_to_filename(slug)}",
        "chars": len(body),
        "_body": body,
    }


def build_page(
    record: dict[str, Any],
    models: dict[str, dict[str, Any]],
    site_url: str,
) -> dict[str, Any] | None:
    """把「关于 / 首页」这类介绍页导出成可全文读取的文档。"""
    fields: dict[str, str] = record["fields"]
    model_id: str = record["model"]
    if model_id not in PAGE_MODELS or is_excluded(fields):
        return None

    body_type = models.get(model_id, {}).get("fields", {}).get("body", "flow")
    raw_body = fields.get("body", "")
    extracted = extract_flow_text(raw_body) if body_type == "flow" else raw_body
    body = cleanup_markdown(extracted)
    if not body.strip():
        return None

    slug = slug_for(record["rel_parts"], fields)
    title = plain_text(fields.get("title", ""))
    if not slug:
        # 根页面（poster）标题通常是 Welcome，对用户没有信息量
        title = PAGE_ROOT_TITLE
    if not title:
        return None

    flat = plain_text(body)
    return {
        "slug": slug,
        "title": title,
        "date": normalize_date(fields.get("pub_date", "")),
        "url": url_for(record["rel_parts"], fields, site_url),
        "summary": clip_summary(flat, 100),
        "file": f"pages/{slug_to_filename(slug)}",
        "chars": len(body),
        "_body": body,
    }


def build_site(
    records: list[dict[str, Any]],
    posts: list[dict[str, Any]],
    pages: list[dict[str, Any]],
    models: dict[str, dict[str, Any]],
    site_url: str,
    site_title: str,
    site_owner: str,
) -> dict[str, Any]:
    """汇总站点简介、栏目结构与「关于」正文。"""
    record_by_parts = {record["rel_parts"]: record for record in records}
    post_count_by_top: dict[str, int] = {}
    for post in posts:
        top = post["slug"].split("/")[0]
        post_count_by_top[top] = post_count_by_top.get(top, 0) + 1

    sections: list[dict[str, Any]] = []
    for parts, record in sorted(record_by_parts.items()):
        if len(parts) != 1 or is_excluded(record["fields"]):
            continue
        fields = record["fields"]
        name = section_label(parts[0], fields)
        summary = plain_text(fields.get("summary", "") or fields.get("description", ""))
        count = post_count_by_top.get(parts[0], 0)
        if not name or (not summary and count == 0):
            continue
        sections.append(
            {
                "name": name,
                "url": url_for(parts, fields, site_url),
                "summary": summary,
                "posts": count,
            }
        )

    about_markdown = ""
    about_record = record_by_parts.get(("about",))
    if about_record is not None:
        body_type = models.get(about_record["model"], {}).get("fields", {}).get("body", "flow")
        raw_body = about_record["fields"].get("body", "")
        extracted = extract_flow_text(raw_body) if body_type == "flow" else raw_body
        about_markdown = cleanup_markdown(extracted)[:ABOUT_MAX_CHARS]

    # 指向「关于」介绍页，供 Agent 在需要全文时用 read_blog_post 读取
    about_url = ""
    about_title = ""
    for page in pages:
        if page["slug"] == "about" or "关于" in page["title"]:
            about_url = page["url"]
            about_title = page["title"]
            break

    dates = sorted(post["date"] for post in posts if post["date"])
    active_sections = [section for section in sections if section["posts"] > 0]
    section_text = "、".join(f"{section['name']}（{section['posts']} 篇）" for section in active_sections)
    description_parts = [f"这是 {site_owner} 的个人技术博客《{site_title}》。"]
    if section_text:
        description_parts.append(f"主要栏目：{section_text}。")
    if posts:
        span = f"最新一篇发布于 {dates[-1]}" if dates else "发布时间未标注"
        if len(dates) > 1 and dates[0] != dates[-1]:
            span = f"时间跨度 {dates[0]} 至 {dates[-1]}"
        description_parts.append(f"共收录 {len(posts)} 篇文章，{span}。")
    description_parts.append("站点内容以技术笔记、工具教程与博客搭建记录为主。")

    return {
        "title": site_title,
        "url": site_url,
        "owner": site_owner,
        "description": "".join(description_parts)[:600],
        "about_title": about_title,
        "about_url": about_url,
        "about_markdown": about_markdown,
        "sections": sections,
    }


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #
def export(
    content_dir: Path,
    models_dir: Path,
    output_dir: Path,
    site_url: str,
    site_title: str,
    site_owner: str,
) -> int:
    if not content_dir.is_dir():
        print(f"[error] 找不到内容目录：{content_dir}", file=sys.stderr)
        return 2

    models = load_models(models_dir)
    records: list[dict[str, Any]] = []
    iter_records(content_dir, "", (), models, content_dir, records)

    section_titles = collect_section_titles(records)
    posts: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    for record in records:
        post = build_post(record, models, site_url, section_titles)
        if post is not None:
            posts.append(post)
            continue
        page = build_page(record, models, site_url)
        if page is not None:
            pages.append(page)

    # 日期倒序，无日期的排最后，再按标题稳定排序
    posts.sort(key=lambda item: (item["date"] or "0000-00-00", item["title"]), reverse=True)

    posts_dir = output_dir / "posts"
    posts_dir.mkdir(parents=True, exist_ok=True)
    for stale in posts_dir.glob("*.md"):
        stale.unlink()

    for post in posts:
        body = post.pop("_body")
        header = (
            f"# {post['title']}\n\n"
            f"- 发布日期：{post['date'] or '未标注'}\n"
            f"- 原文链接：{post['url']}\n"
            f"- 标签：{'、'.join(post['tags']) or '无'}\n\n"
            f"---\n\n"
        )
        write_text(output_dir / post["file"], header + body + "\n")

    pages_dir = output_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    for stale in pages_dir.glob("*.md"):
        stale.unlink()

    for page in pages:
        body = page.pop("_body")
        header = (
            f"# {page['title']}\n\n"
            f"- 页面链接：{page['url']}\n"
            f"- 正文字数：约 {page['chars']} 字\n\n"
            f"---\n\n"
        )
        write_text(output_dir / page["file"], header + body + "\n")

    site = build_site(records, posts, pages, models, site_url, site_title, site_owner)
    index = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "site": site,
        "posts": posts,
        "pages": pages,
    }
    write_text(output_dir / "index.json", json.dumps(index, ensure_ascii=False, indent=2) + "\n")

    total_chars = sum(post["chars"] for post in posts)
    print(f"[ok] 内容目录：{content_dir}")
    print(f"[ok] 导出目录：{output_dir}")
    print(f"[ok] 文章数量：{len(posts)} 篇（正文合计 {total_chars} 字）")
    for post in posts:
        print(f"     - {post['date'] or '----------'}  {post['title']}  ->  {post['url']}")
    print(f"[ok] 介绍页：{len(pages)} 个")
    for page in pages:
        print(f"     - {page['title']}  ({page['chars']} 字)  ->  {page['url']}")

    if not posts:
        print("[error] 没有解析到任何文章，请检查 content/ 与 models/ 是否匹配", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="导出 Lektor 博客为纯文本/Markdown 数据包")
    parser.add_argument("--content", type=Path, default=DEFAULT_CONTENT_DIR, help="Lektor 内容目录")
    parser.add_argument("--models", type=Path, default=DEFAULT_MODELS_DIR, help="Lektor 模型目录")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR, help="输出目录")
    parser.add_argument("--site-url", default=DEFAULT_SITE_URL, help="站点根地址，用于拼接文章链接")
    parser.add_argument("--site-title", default=DEFAULT_SITE_TITLE, help="站点标题")
    parser.add_argument("--site-owner", default=DEFAULT_SITE_OWNER, help="站点作者")
    args = parser.parse_args(argv)

    site_url = args.site_url.rstrip("/")
    return export(
        content_dir=args.content.resolve(),
        models_dir=args.models.resolve(),
        output_dir=args.output.resolve(),
        site_url=site_url,
        site_title=args.site_title,
        site_owner=args.site_owner,
    )


if __name__ == "__main__":
    raise SystemExit(main())
