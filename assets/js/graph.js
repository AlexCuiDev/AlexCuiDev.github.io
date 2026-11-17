/* ==========================================================================
   AlexCuiDev · 能力图谱（Force-directed Graph）
   Canvas 2D + 经典力导向模型：斥力 / 弹簧 / 向心力 + 阻尼
   交互：点击节点 → 该节点与直接邻居高亮、其余压暗，说明区浮出文案
   无依赖，原生 JS。
   ========================================================================== */
(function () {
    'use strict';

    var canvas = document.getElementById('capGraph');
    if (!canvas || !canvas.getContext) return;

    var wrap   = canvas.parentElement;
    var tip    = document.getElementById('graphTip');
    var legend = document.getElementById('graphLegend');
    var ctx    = canvas.getContext('2d');

    var tipLabel = tip ? tip.querySelector('.graph-tip-label') : null;
    var tipText  = tip ? tip.querySelector('.graph-tip-text')  : null;

    /* ---------- 1. 数据 ---------- */
    var NODES = [
        { id: 'presale',  short: '售前', name: '售前与需求洞察', r: 19,
          desc: '需求调研、痛点挖掘、技术交流与 Demo / POC 演示、价值传递与技术答疑——把客户自己都说不清的需求，问成可落地的方案输入。' },
        { id: 'scheme',   short: '方案', name: '行业方案设计',   r: 18,
          desc: '面向装备制造、汽车 / 新能源、AEC 桥梁等领域输出解决方案、技术建议书与方案 PPT，同时把共性需求反馈回产品研发。' },
        { id: 'dev',      short: '开发', name: '二次开发',       r: 18,
          desc: '基于达索 3DEXPERIENCE / CATIA 做二次开发与规则引擎，把业务规则编码为平台原生命令，让专业能力沉淀在平台里，而不是留在个人电脑。' },
        { id: 'bim',      short: 'BIM',  name: 'BIM 正向设计',  r: 16,
          desc: '从参数化建模到成果输出的正向设计系统族谱（TJAD-SCCB 系列），覆盖「方案设计 → 结构计算 → 成果输出」全链路，支撑桥梁设计院落地。' },
        { id: 'data',     short: '互通', name: '数据互通',       r: 15,
          desc: '打通设计数据、装配图与设计 BOM，配合 3DDashboard 数字大屏与移动端三维交付，让平台价值从一线到决策层都能直接看见。' },
        { id: 'delivery', short: '交付', name: '交付实施',       r: 18,
          desc: '售前到实施的技术移交、跨团队资源协调、现场攻坚与售后攻关——上线只是开始，工程师用得起来才算交付。' },
        { id: 'enable',   short: '赋能', name: '培训赋能',       r: 13,
          desc: '面向主机厂与设计院的技术、业务团队完成平台能力、建模规范与数据组织的宣讲与知识转移，把产品功能翻译成客户自己的操作规范。' },
        { id: 'ai',       short: 'AI',   name: 'AI 工程',        r: 14,
          desc: '独立完成达索 IPE Portfolio 分析工具（11 个模块），集成 LLM 摘要并做规则降级，已交付客户使用并开源。' }
    ];

    /* 无向边：能力域之间的实际咬合关系 */
    var EDGES = [
        ['presale', 'scheme'],   ['presale', 'enable'],  ['presale', 'delivery'],
        ['scheme',  'dev'],      ['scheme',  'data'],    ['scheme',  'delivery'],
        ['dev',     'bim'],      ['dev',     'ai'],      ['dev',     'data'],
        ['bim',     'data'],     ['bim',     'delivery'],
        ['data',    'ai'],       ['data',    'delivery'],
        ['delivery','enable'],
        ['ai',      'enable']
    ];

    /* ---------- 2. 力模型参数 ---------- */
    var REP     = 11000;   /* 斥力强度 */
    var SPRING  = 0.011;   /* 弹簧强度 */
    var REST    = 132;     /* 弹簧自然长度 */
    var GRAV    = 0.0035;  /* 向心力 */
    var DAMP    = 0.86;    /* 阻尼 */
    var JITTER  = 0.055;   /* 随机扰动：让图谱持续轻微漂移 */
    var ALPHA_FLOOR = 0.28;

    var ACCENT = '88, 166, 255';

    /* ---------- 3. 状态 ---------- */
    var nodes = [], links = [];
    var selected = null, hovered = null;
    var W = 0, H = 0, dpr = 1;
    var alpha = 1, raf = null;
    var reduceMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    function motionOK() { return !(reduceMotion && reduceMotion.matches); }

    /* ---------- 4. 初始化布局 ---------- */
    function build() {
        var i, n = NODES.length;
        nodes = NODES.map(function (d, idx) {
            /* 初始位置排成椭圆，相位错开，避免完全对称的死板布局 */
            var ang = (idx / n) * Math.PI * 2 - Math.PI / 2;
            return {
                id: d.id, short: d.short, name: d.name, desc: d.desc, r: d.r,
                x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0
            };
        });

        var index = {};
        nodes.forEach(function (nd, idx) { index[nd.id] = idx; });
        links = EDGES.map(function (e) {
            return { a: index[e[0]], b: index[e[1]] };
        });

        seed();
    }

    function seed() {
        var n = nodes.length;
        var rx = Math.max(90, W * 0.33);
        var ry = Math.max(70, H * 0.32);
        nodes.forEach(function (nd, idx) {
            var ang = (idx / n) * Math.PI * 2 - Math.PI / 2;
            nd.x = W / 2 + Math.cos(ang) * rx;
            nd.y = H / 2 + Math.sin(ang) * ry;
            nd.vx = 0; nd.vy = 0;
        });
    }

    /* ---------- 5. 物理步进 ---------- */
    function step() {
        var i, j, a, b, dx, dy, d, f, i2, len;
        var cx = W / 2, cy = H / 2;

        for (i = 0; i < nodes.length; i++) {
            a = nodes[i];
            a.fx = 0; a.fy = 0;
        }

        /* 斥力：所有节点互相推开 */
        for (i = 0; i < nodes.length; i++) {
            a = nodes[i];
            for (j = i + 1; j < nodes.length; j++) {
                b = nodes[j];
                dx = a.x - b.x;
                dy = a.y - b.y;
                d  = Math.sqrt(dx * dx + dy * dy);
                if (d < 0.01) { dx = 0.1; dy = 0.1; d = 0.14; }
                f = REP / (d * d);
                i2 = f * dx / d;
                len = f * dy / d;
                a.fx += i2; a.fy += len;
                b.fx -= i2; b.fy -= len;
            }
        }

        /* 弹簧：有边相连的节点相互拉近 */
        for (i = 0; i < links.length; i++) {
            a = nodes[links[i].a];
            b = nodes[links[i].b];
            dx = a.x - b.x;
            dy = a.y - b.y;
            d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
            f = SPRING * (d - REST);
            i2 = f * dx / d;
            len = f * dy / d;
            a.fx -= i2; a.fy -= len;
            b.fx += i2; b.fy += len;
        }

        /* 向心力 + 随机扰动 */
        for (i = 0; i < nodes.length; i++) {
            a = nodes[i];
            a.fx += (cx - a.x) * GRAV;
            a.fy += (cy - a.y) * GRAV;
            a.fx += (Math.random() - 0.5) * JITTER;
            a.fy += (Math.random() - 0.5) * JITTER;
        }

        /* 积分 */
        for (i = 0; i < nodes.length; i++) {
            a = nodes[i];
            a.vx = (a.vx + a.fx * alpha) * DAMP;
            a.vy = (a.vy + a.fy * alpha) * DAMP;
            if (a.vx > 6) a.vx = 6; else if (a.vx < -6) a.vx = -6;
            if (a.vy > 6) a.vy = 6; else if (a.vy < -6) a.vy = -6;
            a.x += a.vx;
            a.y += a.vy;

            /* 边界约束 */
            var pad = a.r + 6;
            if (a.x < pad)     { a.x = pad;     a.vx *= -0.4; }
            if (a.x > W - pad) { a.x = W - pad; a.vx *= -0.4; }
            if (a.y < pad)     { a.y = pad;     a.vy *= -0.4; }
            if (a.y > H - pad) { a.y = H - pad; a.vy *= -0.4; }
        }
    }

    /* 预热：先跑若干步让布局收敛，首屏一出现就是成形状态 */
    function settle(ticks) {
        for (var i = 0; i < ticks; i++) step();
        alpha = ALPHA_FLOOR;
    }

    /* ---------- 6. 绘制 ---------- */
    function neighboursOf(id) {
        var set = {};
        if (!id) return set;
        set[id] = true;
        for (var i = 0; i < links.length; i++) {
            var l = links[i];
            var aid = nodes[l.a].id, bid = nodes[l.b].id;
            if (aid === id) set[bid] = true;
            if (bid === id) set[aid] = true;
        }
        return set;
    }

    function draw() {
        if (!W || !H) return;
        ctx.clearRect(0, 0, W, H);

        var nb = neighboursOf(selected);
        var i, l, a, b, active;

        /* 连线 */
        ctx.lineCap = 'round';
        for (i = 0; i < links.length; i++) {
            l = links[i];
            a = nodes[l.a]; b = nodes[l.b];
            active = selected && (l.a === l.b || a.id === selected || b.id === selected);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            if (!selected) {
                ctx.strokeStyle = 'rgba(255, 255, 255, .13)';
                ctx.lineWidth = 1;
            } else if (active) {
                ctx.strokeStyle = 'rgba(' + ACCENT + ', .55)';
                ctx.lineWidth = 1.4;
            } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, .045)';
                ctx.lineWidth = 1;
            }
            ctx.stroke();
        }

        /* 节点 */
        for (i = 0; i < nodes.length; i++) {
            var nd = nodes[i];
            var isSel = nd.id === selected;
            var isNb  = !!nb[nd.id];
            var isHov = nd.id === hovered;
            var dim   = selected && !isSel && !isNb;

            var fill, stroke, ink;

            if (isSel) {
                fill = 'rgba(' + ACCENT + ', 1)';
                stroke = 'rgba(' + ACCENT + ', 1)';
                ink = '#0b0e14';
            } else if (dim) {
                fill = 'rgba(255, 255, 255, .045)';
                stroke = 'rgba(255, 255, 255, .13)';
                ink = 'rgba(230, 237, 243, .34)';
            } else if (isNb) {
                fill = 'rgba(' + ACCENT + ', .26)';
                stroke = 'rgba(' + ACCENT + ', .85)';
                ink = '#e6edf3';
            } else if (isHov) {
                fill = 'rgba(' + ACCENT + ', .22)';
                stroke = 'rgba(' + ACCENT + ', .7)';
                ink = '#e6edf3';
            } else {
                fill = 'rgba(' + ACCENT + ', .13)';
                stroke = 'rgba(' + ACCENT + ', .5)';
                ink = 'rgba(207, 227, 255, .9)';
            }

            /* 选中节点外圈光晕 */
            if (isSel || isHov) {
                ctx.beginPath();
                ctx.arc(nd.x, nd.y, nd.r + (isSel ? 9 : 5), 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(' + ACCENT + ', .10)';
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.lineWidth = isSel ? 1.6 : 1;
            ctx.strokeStyle = stroke;
            ctx.stroke();

            /* 节点内短标签 */
            var fs = Math.max(9, Math.min(12, nd.r * 0.66));
            ctx.font = '600 ' + fs + 'px ' +
                '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = ink;
            ctx.fillText(nd.short, nd.x, nd.y + 0.5);
        }
    }

    /* ---------- 7. 循环 ---------- */
    function loop() {
        raf = window.requestAnimationFrame(loop);
        step();
        alpha = Math.max(ALPHA_FLOOR, alpha - 0.004);
        draw();
    }

    function start() {
        if (raf) return;
        raf = window.requestAnimationFrame(loop);
    }

    function stop() {
        if (!raf) return;
        window.cancelAnimationFrame(raf);
        raf = null;
    }

    /* ---------- 8. 交互 ---------- */
    function nodeAt(x, y) {
        var best = null, bd = Infinity;
        for (var i = 0; i < nodes.length; i++) {
            var nd = nodes[i];
            var dx = nd.x - x, dy = nd.y - y;
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d <= nd.r + 10 && d < bd) { bd = d; best = nd; }
        }
        return best;
    }

    function canvasPos(e) {
        var rect = canvas.getBoundingClientRect();
        var pt = e.touches && e.touches[0] ? e.touches[0] : e;
        return { x: pt.clientX - rect.left, y: pt.clientY - rect.top };
    }

    function select(id) {
        selected = (selected === id) ? null : id;
        renderTip();
        renderLegend();
        draw();
    }

    function renderTip() {
        if (!tipLabel || !tipText) return;
        var nd = null;
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].id === selected) { nd = nodes[i]; break; }
        }
        if (nd) {
            tipLabel.textContent = nd.name;
            tipText.textContent = nd.desc;
            tip.classList.add('is-active');
        } else {
            tipLabel.textContent = '点击任意节点';
            tipText.textContent = '查看该能力域的具体做法与代表成果。';
            tip.classList.remove('is-active');
        }
    }

    function renderLegend() {
        if (!legend) return;
        var btns = legend.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            var on = btns[i].getAttribute('data-node') === selected;
            btns[i].classList.toggle('is-active', on);
            btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }

    /* 图例：与画布节点等价，同时充当键盘 / 读屏入口 */
    function buildLegend() {
        if (!legend) return;
        legend.innerHTML = '';
        NODES.forEach(function (d) {
            var li = document.createElement('li');
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-node', d.id);
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = d.name;
            btn.addEventListener('click', function () { select(d.id); });
            li.appendChild(btn);
            legend.appendChild(li);
        });
    }

    canvas.addEventListener('mousemove', function (e) {
        var p = canvasPos(e);
        var nd = nodeAt(p.x, p.y);
        var id = nd ? nd.id : null;
        if (id !== hovered) {
            hovered = id;
            canvas.style.cursor = nd ? 'pointer' : 'default';
            draw();
        }
    });

    canvas.addEventListener('mouseleave', function () {
        if (hovered) { hovered = null; draw(); }
    });

    canvas.addEventListener('click', function (e) {
        var p = canvasPos(e);
        var nd = nodeAt(p.x, p.y);
        if (nd) select(nd.id);
    });

    canvas.addEventListener('touchstart', function (e) {
        var p = canvasPos(e);
        var nd = nodeAt(p.x, p.y);
        if (nd) { select(nd.id); e.preventDefault(); }
    }, { passive: false });

    /* ---------- 9. 尺寸 ---------- */
    function resize() {
        var rect = wrap.getBoundingClientRect();
        var w = Math.round(rect.width), h = Math.round(rect.height);
        if (!w || !h) return;

        var wasInit = !W;
        W = w; H = h;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (wasInit) {
            seed();
            settle(320);
        } else {
            /* 尺寸变化时按比例迁移坐标，避免节点飞出画布 */
            var oldW = W, oldH = H;
            for (var i = 0; i < nodes.length; i++) {
                var nd = nodes[i];
                nd.x = Math.max(nd.r + 6, Math.min(W - nd.r - 6, nd.x));
                nd.y = Math.max(nd.r + 6, Math.min(H - nd.r - 6, nd.y));
            }
            settle(60);
        }
        draw();
    }

    /* ---------- 10. 启动 ---------- */
    build();
    buildLegend();
    renderTip();

    if ('ResizeObserver' in window) {
        new ResizeObserver(function () { resize(); }).observe(wrap);
    } else {
        window.addEventListener('resize', resize);
    }

    resize();

    if (motionOK()) {
        start();
    } else {
        settle(260);
        draw();
    }

    if (reduceMotion) {
        var onChange = function () {
            if (motionOK()) {
                settle(60);
                start();
            } else {
                stop();
                settle(200);
                draw();
            }
        };
        if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onChange);
        else if (reduceMotion.addListener) reduceMotion.addListener(onChange);
    }

    /* 页面隐藏时停掉动画，省电 */
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop();
        else if (motionOK()) start();
    });
})();
