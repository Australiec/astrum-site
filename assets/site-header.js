/* Общая логика шапки (мобильное меню + плавный переключатель темы) для Wiki и Map */
(() => {
  const root = document.documentElement;
  const burger = document.querySelector('.burger');
  const sw = document.getElementById('sw');
  const menuBtn = document.getElementById('menu');

  /* мобильное меню сайта */
  const setMenu = open => {
    document.body.classList.toggle('menu-open', open);
    document.querySelectorAll('main, footer').forEach(el => { el.inert = open; });
    if (open && document.body.classList.contains('open')) {
      document.body.classList.remove('open');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    }
    if (burger) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    }
  };
  if (burger) {
    burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    document.querySelectorAll('.top a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('click', e => {
      if (document.body.classList.contains('menu-open') && !e.target.closest('.top')) setMenu(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
        setMenu(false);
        burger.focus();
      }
    });
    if (window.matchMedia) {
      const mqNav = matchMedia('(max-width: 1020px)');
      if (mqNav.addEventListener) mqNav.addEventListener('change', () => setMenu(false));
    }
  }

  /* переключатель день / ночь и синхронизация с темой устройства */
  let skyJob = 0;
  let pendingSky = null;
  const setSkyImmediate = sky => {
    pendingSky = null;
    root.dataset.sky = sky;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.content = sky === 'night' ? '#010101' : '#fff7fd';
  };
  const applySkySnap = sky => {
    root.classList.add('sky-snap');
    setSkyImmediate(sky);
    void root.offsetHeight;
    root.classList.remove('sky-snap');
  };
  const transitionSky = (sky, origin) => {
    const job = ++skyJob;
    pendingSky = sky;
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || document.hidden || reduceMotion) {
      root.classList.remove('sky-circle', 'sky-xfade');
      setSkyImmediate(sky);
      return;
    }
    if (root.dataset.sky === sky) {
      setSkyImmediate(sky);
      return;
    }
    root.classList.remove('sky-circle', 'sky-xfade');
    root.classList.add(origin ? 'sky-circle' : 'sky-xfade');
    let vt;
    try {
      vt = document.startViewTransition(() => {
        if (job === skyJob) applySkySnap(sky);
      });
    } catch {
      root.classList.remove('sky-circle', 'sky-xfade');
      setSkyImmediate(sky);
      return;
    }
    if (origin) {
      vt.ready
        .then(() => {
          if (job !== skyJob) return;
          const vv = window.visualViewport;
          const vw = Math.max(innerWidth, document.documentElement.clientWidth, vv ? vv.width : 0);
          const vh = Math.max(innerHeight, document.documentElement.clientHeight, vv ? vv.height : 0);
          const ox = Math.max(0, Math.min(vw, origin.x));
          const oy = Math.max(0, Math.min(vh, origin.y));
          const r = Math.ceil(Math.hypot(Math.max(ox, vw - ox), Math.max(oy, vh - oy + 180)) * 1.15);
          root.animate(
            { clipPath: [`circle(0px at ${ox}px ${oy}px)`, `circle(${r}px at ${ox}px ${oy}px)`] },
            { duration: 620, easing: 'cubic-bezier(0.32, 0.72, 0.24, 1)', fill: 'forwards', pseudoElement: '::view-transition-new(root)' }
          );
        })
        .catch(() => {});
    }
    vt.finished.finally(() => {
      if (job === skyJob) root.classList.remove('sky-circle', 'sky-xfade');
    });
  };

  if (sw) {
    sw.addEventListener('click', e => {
      const current = pendingSky || root.dataset.sky;
      const sky = current === 'night' ? 'day' : 'night';
      try { localStorage.setItem('astrum-sky', sky); } catch {}
      const hasPtr = e && e.detail > 0 && (e.clientX || e.clientY);
      const rect = sw.getBoundingClientRect();
      const origin = hasPtr ? { x: e.clientX, y: e.clientY } : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      transitionSky(sky, origin);
    });
  }

  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: light)');
    if (mq.addEventListener) {
      mq.addEventListener('change', e => {
        try {
          const saved = localStorage.getItem('astrum-sky');
          if (saved === 'night' || saved === 'day') return;
        } catch {}
        transitionSky(e.matches ? 'day' : 'night', null);
      });
    }
  }
})();
