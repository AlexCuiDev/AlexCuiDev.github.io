/**
 * md2html.ts —— 把文章 Markdown 渲染成「搜索引擎能直接抓到正文」的静态 HTML 页
 *
 * 为什么需要静态页？
 *   原来的阅读页 blog/post-viewer.html?file=xxx.md 靠 JS 注入正文，
 *   爬虫抓到的是一个空壳（实测原始 HTML 里 0 篇文章标题，正文全在 posts-data.js 里）。
 *   结果就是：文章写得再好，搜索引擎和 AI 检索也完全读不到。
 *   静态页把正文直接写进 HTML，禁用 JS 也能读，并配 canonical 与 BlogPosting 结构化数据。
 *
 * 输入：build-posts.py 传来的 JSON 数组
 *   [{ slug, title, date, tag, desc, content }, ...]    content 为 Markdown 正文
 * 输出：blog/<slug>.html
 *
 * 用法：deno run --allow-read --allow-write tools/md2html.ts <input.json> <blogDir>
 *
 * 依赖：只用仓库里已本地化的 vendor/marked.min.js 与 vendor/highlight.min.js，不联网。
 */

const SITE = "https://alexcuidev.github.io";

/** 在没有 module / exports 的环境里执行 UMD，它会把自己挂到 globalThis 上 */
function loadUmd(path: string): any {
  const src = Deno.readTextFileSync(path);
  const runner = new Function(src + "\nreturn globalThis;");
  return runner();
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 把 marked 转义过的 HTML 还原成原始代码文本，交给 highlight.js */
function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** marked 渲染完再跑一遍代码高亮：marked v12 不再内置 highlight 回调 */
function highlightCode(html: string, hljs: any): string {
  return html.replace(
    /<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g,
    (_m, lang: string, code: string) => {
      const raw = unescapeHtml(code);
      try {
        const out = hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value;
        return `<pre><code class="hljs language-${lang}">${out}</code></pre>`;
      } catch {
        return `<pre><code class="hljs">${raw}</code></pre>`;
      }
    },
  );
}

function renderPage(
  post: any,
  bodyHtml: string,
  prev: any | null,
  next: any | null,
): string {
  const url = `${SITE}/blog/${post.slug}.html`;
  const title = String(post.title ?? "");
  const desc = String(post.desc ?? "");
  const tag = String(post.tag ?? "");
  const date = String(post.date ?? "");

  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": title,
    "description": desc,
    "datePublished": date,
    "dateModified": post.dateModified || date,
    "keywords": tag,
    "inLanguage": "zh-CN",
    "author": { "@id": `${SITE}/#person` },
    "publisher": { "@id": `${SITE}/#person` },
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
  };

  const nav: string[] = [];
  if (prev) {
    nav.push(
      `<a class="btn btn-ghost btn--sm" rel="prev" href="./${escapeHtml(prev.slug)}.html">← ${escapeHtml(prev.title)}</a>`,
    );
  }
  if (next) {
    nav.push(
      `<a class="btn btn-ghost btn--sm" rel="next" href="./${escapeHtml(next.slug)}.html">${escapeHtml(next.title)} →</a>`,
    );
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | 崔小建 · 技术博客</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="theme-color" content="#0b0e14">
<meta name="author" content="崔小建">
<link rel="canonical" href="${url}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="AlexCuiDev">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="zh_CN">
<meta property="og:image" content="${SITE}/images/project02.webp">
<meta property="og:image:alt" content="${escapeHtml(title)}">
<meta property="article:published_time" content="${escapeHtml(date)}">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../assets/css/main.css?v=20261118">
<link rel="stylesheet" href="../assets/css/blog.css?v=20261117">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>

<div class="reading-progress" id="progress" aria-hidden="true"></div>

<header class="site-header">
    <div class="container header-inner">
        <a class="logo" href="../index.html" aria-label="AlexCuiDev 首页">
            <span class="logo-mark" aria-hidden="true">AC</span>
            <span class="logo-text">AlexCuiDev</span>
        </a>

        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="siteNav" aria-label="展开导航菜单">
            <span class="nav-toggle-bar" aria-hidden="true"></span>
            <span class="nav-toggle-bar" aria-hidden="true"></span>
            <span class="nav-toggle-bar" aria-hidden="true"></span>
        </button>

        <nav class="nav-links" id="siteNav" aria-label="主导航">
            <a href="../index.html#home">首页</a>
            <a href="../index.html#about">关于我</a>
            <a href="../index.html#skills">核心能力</a>
            <a href="../index.html#experience">工作经历</a>
            <a href="../index.html#works">成果展示</a>
            <a href="../works.html">成果与资质</a>
            <a href="index.html" aria-current="page">技术博客</a>
        </nav>
    </div>
</header>

<main id="main">

    <div class="container">
        <header class="post-head">
            <p class="kicker">/ blog</p>
            <h1 id="postTitle">${escapeHtml(title)}</h1>
            <div class="post-meta">
                <span id="postDate">${escapeHtml(date)}</span>
                <span class="tag chip" id="postTag"${tag ? "" : " hidden"}>${escapeHtml(tag)}</span>
            </div>
        </header>

        <article class="prose" id="content">
${bodyHtml}
        </article>

        <div class="post-foot">
            <a class="btn btn-ghost btn--sm" href="index.html">← 返回博客列表</a>
            <a class="btn btn-ghost btn--sm" href="../index.html#works">查看成果展示</a>
        </div>
${nav.length ? `
        <nav class="post-sibling" aria-label="相邻文章">
${nav.map((n) => `            ${n}`).join("\n")}
        </nav>
` : ""}
    </div>

</main>

<footer class="site-footer">
    <div class="container footer-grid">
        <div class="footer-brand">
            <a class="logo" href="../index.html">
                <span class="logo-mark" aria-hidden="true">AC</span>
                <span class="logo-text">AlexCuiDev</span>
            </a>
            <p>高级解决方案经理，现居上海。专注工业软件的售前方案、二次开发与交付实施，把平台价值落到客户现场。</p>
        </div>
        <div class="footer-col">
            <h4>导航</h4>
            <ul>
                <li><a href="../index.html#home">首页</a></li>
                <li><a href="../index.html#about">关于我</a></li>
                <li><a href="../index.html#skills">核心能力</a></li>
                <li><a href="../index.html#experience">工作经历</a></li>
                <li><a href="../index.html#works">成果展示</a></li>
                <li><a href="../works.html">成果与资质</a></li>
                <li><a href="index.html" aria-current="page">技术博客</a></li>
            </ul>
        </div>
        <div class="footer-col">
            <h4>联系</h4>
            <ul>
                <li><a href="mailto:cuixiaojianok@outlook.com">cuixiaojianok@outlook.com</a></li>
                <li><a href="https://github.com/AlexCuiDev" target="_blank" rel="noopener">GitHub ↗</a></li>
            </ul>
        </div>
    </div>
    <div class="container footer-bottom">
        <span>© <span data-year>2026</span> AlexCuiDev</span>
        <span>售前方案 / 二次开发 / 参数化正向设计 / 交付实施</span>
    </div>
</footer>

<button class="to-top" type="button" aria-label="回到顶部">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
</button>

<script src="../assets/js/main.js?v=20261117"></script>
</body>
</html>
`;
}

if (import.meta.main) {
  const [inputPath, blogDir] = Deno.args;
  if (!inputPath || !blogDir) {
    console.error("用法：deno run --allow-read --allow-write tools/md2html.ts <input.json> <blogDir>");
    Deno.exit(1);
  }

  const repoRoot = new URL("../", import.meta.url);
  const g = loadUmd(new URL("blog/vendor/marked.min.js", repoRoot).pathname);
  const hljs = loadUmd(new URL("blog/vendor/highlight.min.js", repoRoot).pathname);
  const marked = g.marked ?? g;

  const posts = JSON.parse(Deno.readTextFileSync(inputPath));
  posts.sort((a: any, b: any) =>
    String(b.date ?? "").localeCompare(String(a.date ?? ""))
  );

  const written: string[] = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const prev = i > 0 ? posts[i - 1] : null;
    const next = i < posts.length - 1 ? posts[i + 1] : null;
    const raw = marked.parse(String(post.content ?? ""));
    const bodyHtml = highlightCode(raw, hljs).trim();
    const html = renderPage(post, bodyHtml, prev, next);
    const outPath = `${blogDir}/${post.slug}.html`;
    Deno.writeTextFileSync(outPath, html);
    written.push(outPath);
  }

  console.log(`[静态页] 已生成 ${written.length} 个：`);
  for (const p of written) console.log(`  - ${p}`);
}
