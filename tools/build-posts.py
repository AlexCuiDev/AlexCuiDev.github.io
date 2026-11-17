#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 blog/posts/*.md 打包成博客页面用的数据文件：

    blog/posts.json      文章元信息（保留，兼容旧链接）
    blog/posts-data.js   页面用 <script> 直接加载的版本（内含正文 Markdown）

为什么不用 fetch('posts.json')？
    浏览器在 file:// 协议下会禁止 fetch 本地文件（CORS），
    页面直接报 "文章列表加载失败：Failed to fetch"。
    改成 <script> 加载后，file:// / http:// / GitHub Pages 三种打开方式都能跑。

加一篇文章的完整步骤：
    1) 在 blog/posts/ 放一个 .md，开头写元信息（front matter）
    2) python tools/build-posts.py
    3) git add -A && git commit

元信息写法（写在 .md 最前面，用 --- 包住）：

    ---
    title: 文章标题
    date: 2026-05-21
    tag: 3DEXPERIENCE开发-CAA
    desc: 一句话摘要
    ---

    正文从这里开始，标准 Markdown。
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

# Windows 控制台默认 GBK，中文输出会花屏，强制切 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

ROOT = Path(__file__).resolve().parent.parent
BLOG = ROOT / "blog"
POSTS_DIR = BLOG / "posts"
POSTS_JSON = BLOG / "posts.json"
POSTS_JS = BLOG / "posts-data.js"
HTML_FILES = (BLOG / "index.html", BLOG / "post-viewer.html")

FRONT_MATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.S)
DATE_DIV_RE = re.compile(r"\A\s*<div[^>]*class=[\"']?date[\"']?[^>]*>[^<]*</div>\s*\Z", re.I)
H1_RE = re.compile(r"\A\s*#\s+(.*\S)\s*\Z")


def read_text(path):
    """按 UTF-8 读，兼容 BOM。"""
    return path.read_bytes().decode("utf-8-sig")


def write_text(path, text, newline="\n"):
    """统一换行符后按 UTF-8（无 BOM）写。"""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    path.write_bytes(normalized.replace("\n", newline).encode("utf-8"))


def detect_newline(text):
    return "\r\n" if "\r\n" in text else "\n"


def parse_front_matter(text):
    """返回 (元信息 dict 或 None, 正文)。没有 front matter 时元信息为 None。"""
    m = FRONT_MATTER_RE.match(text)
    if not m:
        return None, text

    meta = {}
    for raw in m.group(1).splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        meta[key.strip()] = value
    return meta, text[m.end():]


def legacy_index():
    """旧版 posts.json 里的元信息，用来给没有 front matter 的老文章自动补齐。"""
    if not POSTS_JSON.exists():
        return {}
    try:
        data = json.loads(read_text(POSTS_JSON))
    except (ValueError, OSError):
        return {}
    return {p["filename"]: p for p in data if isinstance(p, dict) and p.get("filename")}


def ensure_front_matter(md_path, legacy):
    """保证 md 里有 front matter；返回 (元信息, 是否改写了文件)。"""
    text = read_text(md_path)
    meta, _ = parse_front_matter(text)
    if meta is not None:
        return meta, False

    entry = legacy.get(md_path.name)
    if not entry:
        return None, False

    block = "\n".join([
        "---",
        "title: {}".format(entry.get("title", "")),
        "date: {}".format(entry.get("date", "")),
        "tag: {}".format(entry.get("tag", "")),
        "desc: {}".format(entry.get("desc", "")),
        "---",
        "",
    ])
    newline = detect_newline(text)
    write_text(md_path, block + text, newline)
    return parse_front_matter(read_text(md_path))[0], True


def clean_body(body, title):
    """去掉正文里跟页头重复的内容：开头的日期 div、跟标题一样的 H1。

    两样东西可能挨着出现，所以反复剥到剥不动为止。
    """
    lines = body.replace("\r\n", "\n").split("\n")

    def drop_blank():
        while lines and not lines[0].strip():
            lines.pop(0)

    while True:
        drop_blank()
        if not lines:
            break
        if DATE_DIV_RE.match(lines[0]):
            lines.pop(0)
            continue
        h1 = H1_RE.match(lines[0])
        if h1 and h1.group(1).strip() == title.strip():
            lines.pop(0)
            continue
        break

    return "\n".join(lines).rstrip() + "\n"


def build():
    if not POSTS_DIR.exists():
        print("[错误] 找不到目录：{}".format(POSTS_DIR))
        return 1

    legacy = legacy_index()
    posts = []
    errors = []

    for md_path in sorted(POSTS_DIR.glob("*.md")):
        meta, migrated = ensure_front_matter(md_path, legacy)
        if meta is None:
            errors.append("{}：缺少 front matter，请在文件开头写 --- 包裹的 title/date".format(md_path.name))
            continue

        missing = [k for k in ("title", "date") if not meta.get(k)]
        if missing:
            errors.append("{}：front matter 缺少 {}".format(md_path.name, "、".join(missing)))
            continue

        meta, body = parse_front_matter(read_text(md_path))
        posts.append({
            "filename": md_path.name,
            "title": meta.get("title", ""),
            "date": meta.get("date", ""),
            "tag": meta.get("tag", ""),
            "desc": meta.get("desc", ""),
            "content": clean_body(body, meta.get("title", "")),
        })
        if migrated:
            print("[迁移] 已给 {} 补上 front matter".format(md_path.name))

    if errors:
        for e in errors:
            print("[错误] {}".format(e))
        return 1

    # 日期新的排前面
    posts.sort(key=lambda p: (p["date"], p["title"]), reverse=True)

    # posts.json：只留元信息，保持旧格式
    legacy_out = [{k: p[k] for k in ("filename", "title", "date", "tag", "desc")} for p in posts]
    write_text(POSTS_JSON, json.dumps(legacy_out, ensure_ascii=False, indent=2) + "\n", "\r\n")

    # posts-data.js：页面真正加载的文件
    payload = json.dumps(posts, ensure_ascii=False, indent=2)
    js = "\n".join([
        "/* 本文件由 tools/build-posts.py 自动生成，请不要手改。",
        " * 来源：blog/posts/*.md",
        " * 改完文章后重新执行：python tools/build-posts.py",
        " */",
        "window.AlexCuiPosts = {};".format(payload),
        "",
    ])

    changed = not POSTS_JS.exists() or read_text(POSTS_JS) != js
    if changed:
        write_text(POSTS_JS, js)

    # posts-data.js 变了就把 HTML 里的版本号同步 bump，避免浏览器吃旧缓存
    if changed:
        today = datetime.now().strftime("%Y%m%d")
        for html_path in HTML_FILES:
            if not html_path.exists():
                continue
            html = read_text(html_path)
            pattern = re.compile(r'(src="posts-data\.js\?v=)(\d{8})(")')
            new_html, n = pattern.subn(lambda m: m.group(1) + today + m.group(3), html)
            if n:
                write_text(html_path, new_html, detect_newline(html))
                print("[同步] {} 的 posts-data.js 版本号 → {}".format(html_path.name, today))

    print("[完成] {} 篇文章 → {} / {}".format(len(posts), POSTS_JSON.name, POSTS_JS.name))
    return 0


if __name__ == "__main__":
    sys.exit(build())
