// Kingsdown School site behaviour. Vanilla JS, no dependencies.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const desktopNav = matchMedia('(min-width: 1101px)');
  const store = {
    get(k, s = localStorage) { try { return s.getItem(k); } catch { return null; } },
    set(k, v, s = localStorage) { try { s.setItem(k, v); } catch {} },
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- sticky header state ---------- */
  const masthead = $('.masthead');
  if (masthead) {
    new IntersectionObserver(([e]) => document.body.classList.toggle('is-stuck', !e.isIntersecting), { threshold: 0 }).observe(masthead);
    const setMastH = () => document.documentElement.style.setProperty('--mast-h', masthead.offsetHeight + 'px');
    setMastH();
    addEventListener('resize', setMastH, { passive: true });
  }

  /* ---------- menus ---------- */
  const menus = $$('.has-menu');
  let hoverTimer;
  const closeAll = except => menus.forEach(m => {
    if (m === except) return;
    m.classList.remove('is-open');
    $('.nav-link', m).setAttribute('aria-expanded', 'false');
  });
  const setOpen = (m, open) => {
    if (open) closeAll(m);
    m.classList.toggle('is-open', open);
    $('.nav-link', m).setAttribute('aria-expanded', String(open));
  };
  menus.forEach(m => {
    const btn = $('.nav-link', m);
    btn.addEventListener('click', () => setOpen(m, !m.classList.contains('is-open')));
    m.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse' || !desktopNav.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => setOpen(m, true), 90);
    });
    m.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse' || !desktopNav.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => setOpen(m, false), 180);
    });
  });
  document.addEventListener('click', e => { if (desktopNav.matches && !e.target.closest('.has-menu')) closeAll(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = menus.find(m => m.classList.contains('is-open'));
    if (open) { setOpen(open, false); $('.nav-link', open).focus(); }
    if (document.body.classList.contains('menu-open')) toggleDrawer(false);
  });
  // highlight the top-level item for the current page
  const here = document.body.dataset.path;
  const section = (document.body.dataset.section || '').toLowerCase();
  const own = menus.find(m => $('.nav-link', m).textContent.trim().toLowerCase() === section)
    || menus.find(m => $$('.mega a', m).some(a => a.getAttribute('href') === here));
  own && $('.nav-link', own).setAttribute('aria-current', 'page');
  $$('.nav-list > .nav-item > a.nav-link').forEach(a => { if (here && here.startsWith(a.getAttribute('href'))) a.setAttribute('aria-current', 'page'); });

  const toggle = $('[data-menu-toggle]');
  const toggleDrawer = open => {
    document.body.classList.toggle('menu-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    if (!open) closeAll();
  };
  toggle?.addEventListener('click', () => toggleDrawer(!document.body.classList.contains('menu-open')));
  desktopNav.addEventListener('change', () => { toggleDrawer(false); closeAll(); });

  /* ---------- scroll reveal ---------- */
  const revealEls = $$('[data-reveal]');
  if (revealEls.length && !reduceMotion.matches && 'IntersectionObserver' in window) {
    const groups = new Map();
    revealEls.forEach(el => {
      const parent = el.parentElement;
      const n = groups.get(parent) || 0;
      groups.set(parent, n + 1);
      if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', Math.min(n, 8));
    });
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    revealEls.forEach(el => io.observe(el));
  } else revealEls.forEach(el => el.classList.add('is-in'));

  /* ---------- 3D tilt (cards, values, promos) ---------- */
  const bindTilt = el => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = '1';
    const max = el.classList.contains('beat') ? 9 : el.classList.contains('news-card--lg') ? 4 : 7;
    let raf = 0;
    el.addEventListener('pointermove', e => {
      if (!finePointer.matches || reduceMotion.matches) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.classList.add('is-tilting');
        el.style.setProperty('--ry', ((x - .5) * max * 2).toFixed(2) + 'deg');
        el.style.setProperty('--rx', ((.5 - y) * max * 2).toFixed(2) + 'deg');
        el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      });
    });
    el.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf);
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  };
  $$('[data-tilt]').forEach(bindTilt);

  /* ---------- hero slider with depth parallax ---------- */
  const hero = $('[data-hero]');
  if (hero) {
    const slides = $$('[data-slide]', hero);
    const dots = $$('[data-hero-dot]', hero);
    const stage = $('[data-hero-stage]', hero);
    const pauseBtn = $('[data-hero-pause]', hero);
    const DURATION = 7000;
    hero.style.setProperty('--slide-ms', DURATION + 'ms');
    let i = 0, timer = 0, started = 0, remaining = DURATION, userPaused = reduceMotion.matches, hoverPaused = false, visible = true;

    const go = n => {
      const prev = i;
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => { s.classList.toggle('is-active', k === i); s.setAttribute('aria-hidden', String(k !== i)); });
      dots.forEach((d, k) => {
        d.classList.toggle('is-active', k === i);
        d.classList.toggle('is-done', false);
        const bar = d.firstElementChild; bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
      });
      if (prev !== i) { const img = $('img', slides[i]); if (img?.loading === 'lazy') img.loading = 'eager'; }
      remaining = DURATION;
      schedule();
    };
    const running = () => !userPaused && !hoverPaused && visible && !document.hidden;
    const schedule = () => {
      clearTimeout(timer);
      hero.classList.toggle('is-paused', !running());
      if (!running()) return;
      started = performance.now();
      timer = setTimeout(() => go(i + 1), remaining);
    };
    const hold = () => { if (running()) remaining -= performance.now() - started; };
    const setPaused = p => { hold(); userPaused = p; pauseBtn.innerHTML = `<i class="ph ph-${p ? 'play' : 'pause'}"></i>`; pauseBtn.setAttribute('aria-label', p ? 'Play slideshow' : 'Pause slideshow'); schedule(); };

    $('[data-hero-next]', hero).addEventListener('click', () => go(i + 1));
    $('[data-hero-prev]', hero).addEventListener('click', () => go(i - 1));
    dots.forEach((d, k) => d.addEventListener('click', () => go(k)));
    pauseBtn.addEventListener('click', () => setPaused(!userPaused));
    if (userPaused) setPaused(true);
    hero.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hold(); hoverPaused = true; schedule(); } });
    hero.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hoverPaused = false; schedule(); } });
    hero.addEventListener('focusin', () => { hold(); hoverPaused = true; schedule(); });
    hero.addEventListener('focusout', () => { hoverPaused = false; schedule(); });
    document.addEventListener('visibilitychange', () => { hold(); schedule(); });
    new IntersectionObserver(([e]) => { hold(); visible = e.isIntersecting; schedule(); }).observe(hero);

    // swipe
    let sx = null;
    hero.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') sx = e.clientX; });
    hero.addEventListener('pointerup', e => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); });

    // pointer parallax: background tilts away, caption floats forward
    let raf = 0;
    hero.addEventListener('pointermove', e => {
      if (!finePointer.matches || reduceMotion.matches) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = hero.getBoundingClientRect();
        stage.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        stage.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
    });
    hero.addEventListener('pointerleave', () => { stage.style.setProperty('--px', 0); stage.style.setProperty('--py', 0); });
    schedule();
  }

  /* ---------- YouTube click-to-play ---------- */
  document.addEventListener('click', e => {
    const btn = e.target.closest('.yt__btn');
    if (!btn) return;
    const wrap = btn.closest('.yt');
    const f = document.createElement('iframe');
    f.src = `https://www.youtube.com/embed/${wrap.dataset.yt}?autoplay=1&rel=0`;
    f.title = btn.getAttribute('aria-label') || 'YouTube video';
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    f.allowFullscreen = true;
    wrap.replaceChildren(f);
  });

  /* ---------- galleries ---------- */
  $$('[data-gallery]').forEach(g => {
    const track = $('.gallery__track', g);
    const items = $$('.gallery__item', g);
    const count = $('[data-gallery-count]', g);
    const step = d => track.scrollBy({ left: d * track.clientWidth, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    $('[data-gallery-prev]', g).addEventListener('click', () => step(-1));
    $('[data-gallery-next]', g).addEventListener('click', () => step(1));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) count.textContent = `${items.indexOf(e.target) + 1} / ${items.length}`; }), { root: track, threshold: .6 });
    items.forEach(it => io.observe(it));
  });

  /* ---------- lightbox ---------- */
  const lb = $('[data-lightbox]');
  if (lb) {
    const img = $('[data-lightbox-img]', lb), cap = $('[data-lightbox-cap]', lb);
    let set = [], at = 0;
    const show = n => {
      at = (n + set.length) % set.length;
      img.src = set[at].currentSrc || set[at].src;
      img.alt = set[at].alt || '';
      cap.textContent = set.length > 1 ? `${set[at].alt ? set[at].alt + '  |  ' : ''}${at + 1} of ${set.length}` : (set[at].alt || '');
      img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
      $('[data-lightbox-prev]', lb).hidden = $('[data-lightbox-next]', lb).hidden = set.length < 2;
    };
    document.addEventListener('click', e => {
      const t = e.target.closest('img[data-zoom]');
      if (!t) return;
      const scope = t.closest('[data-gallery]') || t.closest('[data-prose]') || document;
      set = $$('img[data-zoom]', scope);
      lb.showModal();
      show(set.indexOf(t));
    });
    $('[data-lightbox-close]', lb).addEventListener('click', () => lb.close());
    $('[data-lightbox-prev]', lb).addEventListener('click', () => show(at - 1));
    $('[data-lightbox-next]', lb).addEventListener('click', () => show(at + 1));
    lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', e => { if (e.key === 'ArrowRight') show(at + 1); if (e.key === 'ArrowLeft') show(at - 1); });
    let sx = null;
    lb.addEventListener('pointerdown', e => { sx = e.clientX; });
    lb.addEventListener('pointerup', e => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1)); });
  }

  /* ---------- content dialogs ---------- */
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-dialog-open]');
    if (open) { document.getElementById(open.dataset.dialogOpen)?.showModal(); return; }
    if (e.target.closest('[data-dialog-close]')) e.target.closest('dialog')?.close();
    if (e.target.matches('dialog.content-dialog')) e.target.close();
  });

  /* ---------- search ---------- */
  const search = $('[data-search]');
  let index = null, loading = null;
  const loadIndex = () => loading || (loading = fetch('/search-index.json').then(r => r.json()).then(d => {
    index = d.map(doc => ({ ...doc, _t: doc.t.toLowerCase(), _s: (doc.s || '').toLowerCase(), _x: (doc.x || '').toLowerCase() }));
    return index;
  }));
  const terms = q => q.toLowerCase().split(/\s+/).map(t => t.replace(/[^\p{L}\p{N}'&-]/gu, '')).filter(t => t.length > 1 || /\d/.test(t));
  const rank = (q, filter) => {
    const ts = terms(q);
    if (!ts.length || !index) return [];
    const out = [];
    for (const d of index) {
      if (filter && !filter(d)) continue;
      let score = 0, ok = true;
      for (const t of ts) {
        const inT = d._t.indexOf(t), inX = d._x.indexOf(t), inS = d._s.indexOf(t);
        if (inT < 0 && inX < 0 && inS < 0) { ok = false; break; }
        if (inT >= 0) score += inT === 0 || d._t[inT - 1] === ' ' ? 14 : 8;
        if (inS >= 0) score += 3;
        if (inX >= 0) score += 1 + Math.min(4, d._x.split(t).length - 1) * .5;
      }
      if (!ok) continue;
      if (d._t === q.toLowerCase().trim()) score += 30;
      if (d.d) score -= .5; // prefer pages over old news when equal
      out.push({ d, score });
    }
    return out.sort((a, b) => b.score - a.score).map(o => o.d);
  };
  const mark = (text, ts) => {
    let h = esc(text);
    ts.forEach(t => { h = h.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); });
    return h;
  };
  const snippet = (d, ts) => {
    const pos = ts.map(t => d._x.indexOf(t)).filter(p => p >= 0).sort((a, b) => a - b)[0];
    if (pos === undefined) return d.x.slice(0, 160);
    const start = Math.max(0, pos - 60);
    return (start ? '...' : '') + d.x.slice(start, start + 170) + '...';
  };
  if (search) {
    const input = $('[data-search-input]', search);
    const results = $('[data-search-results]', search);
    const hint = results.innerHTML;
    let sel = -1, deb;
    const open = () => {
      if (!search.open) search.showModal();
      input.focus(); input.select();
      loadIndex();
    };
    const render = () => {
      const q = input.value.trim();
      sel = -1;
      if (!q) { results.innerHTML = hint; return; }
      if (!index) { results.innerHTML = '<p class="search__empty">Loading...</p>'; loadIndex().then(render); return; }
      const ts = terms(q);
      const hits = rank(q).slice(0, 40);
      results.innerHTML = hits.length
        ? hits.map((d, k) => `<a class="search-result" role="option" id="sr-${k}" href="${d.u}"><span class="search-result__top"><span class="search-result__title">${mark(d.t, ts)}</span><span class="search-result__section">${esc(d.d || d.s || '')}</span></span><span class="search-result__snip">${mark(snippet(d, ts), ts)}</span></a>`).join('')
        : `<p class="search__empty">No results for "${esc(q)}". Try a different word, or browse the menu.</p>`;
    };
    const move = n => {
      const items = $$('.search-result', results);
      if (!items.length) return;
      sel = (sel + n + items.length) % items.length;
      items.forEach((it, k) => it.setAttribute('aria-selected', String(k === sel)));
      items[sel].scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(render, 70); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      if (e.key === 'Enter') { const it = $$('.search-result', results)[Math.max(sel, 0)]; if (it) { e.preventDefault(); location.href = it.href; } }
    });
    $$('[data-search-open]').forEach(b => b.addEventListener('click', open));
    $('[data-search-close]', search).addEventListener('click', () => search.close());
    search.addEventListener('click', e => { if (e.target === search) search.close(); });
    document.addEventListener('keydown', e => {
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName))) { e.preventDefault(); open(); }
    });
  }

  /* ---------- news filter (searches all stories) ---------- */
  const nf = $('[data-news-filter]');
  if (nf) {
    const grid = $('[data-news-grid]'), out = $('[data-news-results]'), pag = $('.pagination');
    let deb;
    nf.addEventListener('focus', loadIndex, { once: true });
    nf.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(async () => {
        const q = nf.value.trim();
        if (!q) { out.hidden = true; grid.hidden = false; if (pag) pag.hidden = false; return; }
        await loadIndex();
        const hits = rank(q, d => d.s === 'News').slice(0, 60);
        grid.hidden = true; if (pag) pag.hidden = true; out.hidden = false;
        out.innerHTML = hits.length ? hits.map(d => `<a class="news-card news-card--sm" href="${d.u}" data-tilt><span class="news-card__media"><img src="${esc(d.i || '')}" alt="" loading="lazy"></span><span class="news-card__body"><span class="news-card__date">${esc(d.d)}</span><span class="news-card__title">${esc(d.t)}</span></span><span class="news-card__glare" aria-hidden="true"></span></a>`).join('')
          : `<p class="news-results__empty">No stories match "${esc(q)}".</p>`;
        $$('[data-tilt]', out).forEach(bindTilt);
      }, 90);
    });
  }

  /* ---------- section nav on small screens ---------- */
  const sn = $('.section-nav__box');
  if (sn) {
    const mq = matchMedia('(max-width: 960px)');
    const sync = () => { sn.open = !mq.matches; };
    sync(); mq.addEventListener('change', sync);
    const cur = $('a[aria-current="page"]', sn);
    if (cur && !mq.matches) { const list = cur.closest('ul'); list.scrollTop = cur.offsetTop - list.clientHeight / 2; }
  }

  /* ---------- copy link ---------- */
  const toast = msg => {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.append(t); setTimeout(() => t.remove(), 2200);
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-copy-link]')) return;
    navigator.clipboard?.writeText(location.href).then(() => toast('Link copied'), () => toast('Could not copy the link'));
  });

  /* ---------- back to top ---------- */
  const top = $('[data-to-top]');
  if (top) {
    const s = document.createElement('div');
    s.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:110vh;pointer-events:none;visibility:hidden';
    document.body.append(s);
    new IntersectionObserver(([e]) => top.classList.toggle('is-visible', !e.isIntersecting)).observe(s);
    top.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); $('.skip-link')?.focus({ preventScroll: true }); });
  }

  /* ---------- cookie notice + Ofsted card ---------- */
  const cookie = $('[data-cookie]');
  const ofsted = $('[data-ofsted]');
  const leave = (el, cb) => { el.classList.add('is-leaving'); setTimeout(() => { el.hidden = true; el.classList.remove('is-leaving'); cb?.(); }, reduceMotion.matches ? 0 : 420); };
  const smallScreen = () => innerWidth < 700;
  const showOfsted = () => {
    if (!ofsted || store.get('kds-ofsted', sessionStorage)) return;
    setTimeout(() => { ofsted.hidden = false; document.body.classList.add('has-ofsted-pop'); }, 1400);
  };
  if (cookie && !store.get('kds-cookies')) {
    setTimeout(() => { cookie.hidden = false; }, 700);
    const done = v => { store.set('kds-cookies', v); leave(cookie, () => { if (smallScreen()) showOfsted(); }); };
    $('[data-cookie-accept]', cookie).addEventListener('click', () => done('accepted'));
    $('[data-cookie-decline]', cookie).addEventListener('click', () => done('declined'));
    if (!smallScreen()) showOfsted();
  } else showOfsted();
  $('[data-ofsted-close]')?.addEventListener('click', () => { store.set('kds-ofsted', '1', sessionStorage); leave(ofsted, () => document.body.classList.remove('has-ofsted-pop')); });
})();
