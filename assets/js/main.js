/* ==========================================================================
   AlexCuiDev · 共享交互脚本
   移动端导航 / 滚动高亮 / 入场动效 / 横向轨道 / 灯箱 / 回到顶部
   无依赖，原生 JS。
   ========================================================================== */
(function () {
    'use strict';

    var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
    var $$ = function (sel, ctx) {
        return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
    };
    var reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- 1. 移动端导航 ---------- */
    (function nav() {
        var toggle = $('.nav-toggle');
        var panel  = $('#siteNav');
        if (!toggle || !panel) return;

        function setOpen(open) {
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            toggle.setAttribute('aria-label', open ? '收起导航菜单' : '展开导航菜单');
            panel.classList.toggle('is-open', open);
            document.body.classList.toggle('nav-open', open);
        }

        toggle.addEventListener('click', function () {
            setOpen(toggle.getAttribute('aria-expanded') !== 'true');
        });

        panel.addEventListener('click', function (e) {
            if (e.target.closest('a')) setOpen(false);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
                setOpen(false);
                toggle.focus();
            }
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 900) setOpen(false);
        });
    })();

    /* ---------- 2. 导航滚动高亮（scroll spy） ---------- */
    (function scrollSpy() {
        var links = $$('.nav-links a[href^="#"]');
        if (!links.length || !('IntersectionObserver' in window)) return;

        var map = [];
        links.forEach(function (a) {
            var id = a.getAttribute('href').slice(1);
            var el = document.getElementById(id);
            if (el) map.push({ a: a, el: el });
        });
        if (!map.length) return;

        function activate(el) {
            links.forEach(function (a) { a.classList.remove('is-active'); });
            var hit = map.filter(function (m) { return m.el === el; })[0];
            if (hit) hit.a.classList.add('is-active');
        }

        var spy = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) activate(e.target);
            });
        }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

        map.forEach(function (m) { spy.observe(m.el); });
    })();

    /* ---------- 3. 入场动效 ---------- */
    function initReveal() {
        var els = $$('.reveal:not(.is-visible)');
        if (!els.length) return;

        if (!('IntersectionObserver' in window) || reduceMotion) {
            els.forEach(function (el) { el.classList.add('is-visible'); });
            return;
        }

        var io = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('is-visible');
                    obs.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });

        els.forEach(function (el) { io.observe(el); });

        /* 兜底：观察器首帧偶尔会漏掉已在视口内的元素（实测冷加载时出现过），
           那样整段内容会永远停在 opacity:0。这里再扫一遍，
           并在滚动 / 缩放时持续补扫，确保漏掉的元素最终也会出现。 */
        var pending = els.slice();

        function sweep() {
            if (!pending.length) return;
            var vh = window.innerHeight;
            pending = pending.filter(function (el) {
                if (!el.isConnected) return false;
                var r = el.getBoundingClientRect();
                if (r.top < vh * 0.94 && r.bottom > 0) {
                    el.classList.add('is-visible');
                    return false;
                }
                return true;
            });
            if (!pending.length) {
                window.removeEventListener('scroll', onScroll);
                window.removeEventListener('resize', onScroll);
            }
        }

        var ticking = false;
        function onScroll() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(function () {
                ticking = false;
                sweep();
            });
        }

        sweep();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
    }

    initReveal();

    /* 供异步插入内容的页面（如博客列表）复用 */
    window.AlexCuiReveal = initReveal;

    /* ---------- 4. 横向轨道：箭头 + 拖拽 + 边缘渐隐 ---------- */
    (function rails() {
        $$('.rail').forEach(function (rail) {
            var track = $('.rail-track', rail);
            if (!track) return;

            var prev = $('.rail-btn--prev', rail);
            var next = $('.rail-btn--next', rail);

            function step() {
                var card = $('.work-card', track);
                if (!card) return 280;
                return card.getBoundingClientRect().width + 16;
            }

            function sync() {
                var max = track.scrollWidth - track.clientWidth;
                var x = track.scrollLeft;
                if (prev) prev.disabled = x <= 2;
                if (next) next.disabled = x >= max - 2;
                rail.classList.toggle('is-start', x <= 2);
                rail.classList.toggle('is-end', x >= max - 2);
            }

            if (prev) prev.addEventListener('click', function () {
                track.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' });
            });
            if (next) next.addEventListener('click', function () {
                track.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' });
            });

            track.addEventListener('scroll', sync, { passive: true });

            /* 拖拽滚动 */
            var down = false, moved = false, startX = 0, startLeft = 0;

            track.addEventListener('pointerdown', function (e) {
                if (e.button !== 0) return;
                down = true;
                moved = false;
                startX = e.clientX;
                startLeft = track.scrollLeft;
            });

            track.addEventListener('pointermove', function (e) {
                if (!down) return;
                var dx = e.clientX - startX;
                if (Math.abs(dx) > 4 && !moved) {
                    moved = true;
                    track.classList.add('is-dragging');
                }
                if (moved) track.scrollLeft = startLeft - dx;
            });

            ['pointerup', 'pointercancel'].forEach(function (ev) {
                track.addEventListener(ev, function () {
                    down = false;
                    track.classList.remove('is-dragging');
                });
            });

            track.addEventListener('pointerleave', function () {
                down = false;
                track.classList.remove('is-dragging');
            });

            /* 拖拽后不要触发卡片上的链接 / 灯箱 */
            track.addEventListener('click', function (e) {
                if (moved) {
                    e.preventDefault();
                    e.stopPropagation();
                    moved = false;
                }
            }, true);

            window.addEventListener('resize', sync);
            sync();
        });
    })();

    /* ---------- 5. 灯箱 ---------- */
    (function lightbox() {
        var box = $('#lightbox');
        if (!box) return;

        var img     = $('#lightboxImg', box);
        var cap     = $('#lightboxCap', box);
        var closeBt = $('.lightbox-close', box);
        var lastFocus = null;

        function open(src, alt) {
            lastFocus = document.activeElement;
            img.src = src;
            img.alt = alt || '';
            if (cap) cap.textContent = alt || '';
            box.classList.add('is-open');
            box.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            if (closeBt) closeBt.focus();
        }

        function close() {
            box.classList.remove('is-open');
            box.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            if (lastFocus && lastFocus.focus) lastFocus.focus();
        }

        document.addEventListener('click', function (e) {
            var trigger = e.target.closest('[data-lightbox]');
            if (trigger) {
                e.preventDefault();
                open(trigger.getAttribute('data-lightbox'),
                     trigger.getAttribute('data-alt') || '');
                return;
            }
            if (e.target.closest('.lightbox-close') || e.target === box) close();
        });

        document.addEventListener('keydown', function (e) {
            if (!box.classList.contains('is-open')) return;
            if (e.key === 'Escape') { close(); return; }
            if (e.key === 'Tab') {
                /* 焦点锁在弹窗内 */
                var f = $$('button, [href], input, select, textarea', box)
                    .filter(function (el) { return el.offsetParent !== null; });
                if (!f.length) return;
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                }
            }
        });

        img.addEventListener('error', function () {
            if (cap) cap.textContent = '图片加载失败：' + (img.getAttribute('src') || '');
        });
    })();

    /* ---------- 6. 回到顶部 ---------- */
    (function toTop() {
        var btn = $('.to-top');
        if (!btn) return;

        btn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        });

        var onScroll = function () {
            btn.classList.toggle('is-visible', window.pageYOffset > 600);
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    })();

    /* ---------- 7. 页脚年份 ---------- */
    $$('[data-year]').forEach(function (el) {
        el.textContent = String(new Date().getFullYear());
    });

    /* ---------- 8. 带锚点直接打开页面时精确落位 ---------- */
    /* 浏览器在 load 之后才执行原生 fragment 滚动，而 html 设了 scroll-behavior: smooth，
       实测会「飞」1.5 秒过去，中途还闪一下上一节。这里在 load 之前就把平滑滚动关掉，
       自己算偏移瞬时定位，再用几次定时器校正懒加载引起的高度变化。 */
    (function hashLanding() {
        var hash = window.location.hash;
        if (!hash || hash.length < 2) return;

        var target = document.getElementById(hash.slice(1));
        if (!target) return;

        var root = document.documentElement;

        /* 关键：本脚本在 body 末尾执行，此时浏览器还没做原生 fragment 滚动，
           现在关掉平滑滚动才来得及。 */
        root.style.scrollBehavior = 'auto';

        var touched = false;
        /* 只认用户真实操作，浏览器自己触发的 scroll 事件不算 */
        ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (evt) {
            window.addEventListener(evt, function () { touched = true; }, { passive: true });
        });

        function jump() {
            if (touched) return;
            var header = $('.site-header');
            var offset = (header ? header.offsetHeight : 64) + 16;
            var y = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
        }

        function restore() {
            root.style.scrollBehavior = '';
        }

        window.addEventListener('load', function () {
            jump();
            setTimeout(jump, 250);
            setTimeout(jump, 900);
            setTimeout(jump, 2000);
            /* 校正完成后再把平滑滚动还给用户后续的锚点点击 */
            setTimeout(restore, 2200);
        });
    })();
})();
