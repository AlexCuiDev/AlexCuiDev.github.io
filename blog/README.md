# 博客维护

## 目录结构

| 文件 | 作用 | 谁维护 |
| --- | --- | --- |
| `posts/*.md` | 文章源文件，开头是元信息（front matter） | 手写 |
| `posts-data.js` | 页面真正加载的文件，含元信息 + 正文 Markdown | 脚本生成，勿手改 |
| `posts.json` | 只有元信息，保留下来给外部用 | 脚本生成 |
| `vendor/` | 本地化的 marked / highlight.js | 手工维护（第三方库） |
| `../tools/build-posts.py` | 打包脚本 | 手工维护 |

## 加一篇文章

1. 新建 `posts/你的文章.md`，开头写元信息：

   ```markdown
   ---
   title: 文章标题
   date: 2026-05-21
   tag: 3DEXPERIENCE开发-CAA
   desc: 一句话摘要
   ---

   正文从这里开始，标准 Markdown。
   ```

   正文里插图统一写绝对路径 `/blog/assets/xxx.png`，页面会自动转成相对路径。

2. 在仓库根目录执行：

   ```bash
   python tools/build-posts.py
   ```

   脚本会重新生成 `posts.json` 和 `posts-data.js`，并自动同步 HTML 里的
   `posts-data.js?v=日期` 版本号（浏览器缓存不会吃到旧数据）。

3. 提交：

   ```bash
   git add -A && git commit -m "docs: 新增文章 xxx"
   ```

## 为什么数据用 `<script>` 而不是 `fetch`

浏览器在 `file://` 协议下会禁止 `fetch` 本地文件（CORS），页面直接报
「文章列表加载失败：Failed to fetch」。改成 `<script src="posts-data.js">` 之后，
**双击打开 HTML、用本地 http 服务器、GitHub Pages** 三种方式都能正常显示。

## 第三方库版本

| 库 | 版本 | 来源 |
| --- | --- | --- |
| marked | 12.0.2 | https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js |
| highlight.js | 11.9.0 | https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/highlight.min.js |

升级时下载对应版本覆盖 `vendor/` 下的文件即可。
