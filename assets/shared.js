/* ASTRUM — скрипт главной страницы (подключается с defer) */
const IP = 'astrums.pro';

/* копирование IP */
const toast = document.getElementById('toast');
let toastTimer;
document.querySelectorAll('[data-ip]').forEach(b => b.addEventListener('click', async () => {
  const targetIp = b.dataset.ip || IP;
  let copied = false;
  try { await navigator.clipboard.writeText(targetIp); copied = true; } catch {
    const input = document.createElement('textarea');
    input.value = targetIp;
    input.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(input);
    input.select();
    try { copied = document.execCommand('copy'); } catch {}
    input.remove();
    b.focus({ preventScroll: true });
  }
  toast.textContent = copied ? `IP ${targetIp} скопирован — до встречи в игре` : 'IP сервера: ' + targetIp;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}));

/* выпадающий список запасных IP */
document.querySelectorAll('.ip-drop').forEach(drop => {
  const btn = drop.querySelector('.ip-drop-btn');
  const menu = drop.querySelector('.ip-drop-menu');
  if (!btn || !menu) return;
  const setOpen = open => {
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });
  menu.querySelectorAll('[data-ip]').forEach(item => item.addEventListener('click', () => setOpen(false)));
  document.addEventListener('click', e => {
    if (!drop.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      btn.focus();
    }
  });
});

/* мобильное меню */
const burger = document.querySelector('.burger');
const setMenu = open => {
  document.body.classList.toggle('menu-open', open);
  document.querySelectorAll('main, footer').forEach(el => { el.inert = open; });
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
};
burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
document.querySelectorAll('.top a').forEach(a => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('menu-open')) {
    setMenu(false);
    burger.focus();
  }
});
matchMedia('(max-width: 1020px)').addEventListener('change', () => setMenu(false));

/* плавный скролл наверх при клике на Главную или лого */
document.querySelectorAll('.nav-links a[href="./"], .brand[href="./"]').forEach(a => {
  a.addEventListener('click', e => {
    if (location.pathname.endsWith('/') || location.pathname.endsWith('index.html')) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
});

/* активный пункт меню при скролле */
const faqSec = document.getElementById('faq');
const navHome = document.querySelector('.nav-links a[href="./"]');
const navFaq = document.querySelector('.nav-links a[href="#faq"]');
const updateActiveNav = () => {
  if (!faqSec || !navHome || !navFaq) return;
  const rect = faqSec.getBoundingClientRect();
  const inFaq = rect.top <= 250 && rect.bottom >= 150;
  navFaq.classList.toggle('active', inFaq);
  navHome.classList.toggle('active', !inFaq);
};

/* Полупрозрачная шапка при прокрутке. */
const nav = document.getElementById('nav');
const onScroll = () => {
  nav.classList.toggle('solid', scrollY > 40);
  updateActiveNav();
};
addEventListener('scroll', onScroll, { passive: true }); onScroll();

/* Переключатель день / ночь и плавная синхронизация с темой устройства. */
{
  const root = document.documentElement;
  const sw = document.getElementById('sw');
  const loadedHero = new Set();
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

  const heroSrc = sky => `assets/hero-${sky}-${window.matchMedia && matchMedia('(max-width: 768px)').matches ? 'mobile' : 'hq'}.webp`;

  const preloadHero = (sky, timeoutMs) => {
    const hbg = document.querySelector('.hbg');
    if (!hbg) return Promise.resolve();
    const rect = hbg.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight) return Promise.resolve();
    const src = heroSrc(sky);
    if (loadedHero.has(src)) return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (ok) loadedHero.add(src);
        resolve();
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      const img = new Image();
      const markReady = () => {
        if (img.decode) img.decode().then(() => finish(true), () => finish(true));
        else finish(true);
      };
      img.onload = markReady;
      img.onerror = () => finish(false);
      img.src = src;
      if (img.complete && img.naturalWidth > 0) markReady();
    });
  };

  const transitionSky = async (sky, origin) => {
    const job = ++skyJob;
    pendingSky = sky;

    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || document.hidden || reduceMotion) {
      pendingSky = null;
      root.classList.remove('sky-circle', 'sky-xfade');
      setSkyImmediate(sky);
      return;
    }

    await preloadHero(sky, origin ? 600 : 1200);
    if (job !== skyJob) return;

    if (root.dataset.sky === sky) {
      setSkyImmediate(sky);
      return;
    }

    if (document.hidden) {
      root.classList.remove('sky-circle', 'sky-xfade');
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
      vt.ready.then(() => {
        if (job !== skyJob) return;
        const r = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
        root.animate(
          { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${r}px at ${origin.x}px ${origin.y}px)`] },
          { duration: 580, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => {});
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
}

/* мягкое появление блоков при прокрутке */
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll('.p,.card,.step,.qs,.band,.head').forEach(el => { el.classList.add('rv'); io.observe(el); });
}

/* плавный аккордеон FAQ */
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('.qs details').forEach(details => {
  const summary = details.querySelector('summary');
  if (!summary) return;

  let content = details.querySelector('.faq-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'faq-content';
    const children = Array.from(details.childNodes).filter(n => n !== summary);
    children.forEach(c => content.appendChild(c));
    details.appendChild(content);
  }

  let animation = null;
  let isClosing = false;
  let isOpening = false;

  summary.addEventListener('click', e => {
    e.preventDefault();
    if (isClosing || !details.open) {
      open();
    } else if (isOpening || details.open) {
      shrink();
    }
  });

  function open() {
    if (animation) animation.cancel();
    isClosing = false;
    isOpening = true;
    details.classList.remove('is-closing');

    const wasOpen = details.open;
    if (!wasOpen) details.open = true;

    if (prefersReduced) {
      isOpening = false;
      return;
    }

    const startHeight = wasOpen ? content.getBoundingClientRect().height : 0;
    content.style.height = 'auto';
    const endHeight = content.scrollHeight;
    content.style.height = `${startHeight}px`;
    content.style.overflow = 'hidden';

    animation = content.animate([
      {
        height: `${startHeight}px`,
        opacity: startHeight > 0 ? (startHeight / endHeight) : 0,
        transform: startHeight > 0 ? 'translateY(0)' : 'translateY(-6px)'
      },
      {
        height: `${endHeight}px`,
        opacity: 1,
        transform: 'translateY(0)'
      }
    ], {
      duration: 300,
      easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)'
    });

    animation.onfinish = () => {
      content.style.height = '';
      content.style.overflow = '';
      animation = null;
      isOpening = false;
    };
    animation.oncancel = () => {
      isOpening = false;
    };
  }

  function shrink() {
    if (animation) animation.cancel();
    isOpening = false;
    isClosing = true;
    details.classList.add('is-closing');

    if (prefersReduced) {
      details.open = false;
      details.classList.remove('is-closing');
      isClosing = false;
      return;
    }

    const startHeight = content.getBoundingClientRect().height;
    content.style.overflow = 'hidden';

    animation = content.animate([
      {
        height: `${startHeight}px`,
        opacity: 1,
        transform: 'translateY(0)'
      },
      {
        height: '0px',
        opacity: 0,
        transform: 'translateY(-6px)'
      }
    ], {
      duration: 250,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
    });

    animation.onfinish = () => {
      details.open = false;
      details.classList.remove('is-closing');
      content.style.height = '';
      content.style.overflow = '';
      animation = null;
      isClosing = false;
    };
    animation.oncancel = () => {
      isClosing = false;
    };
  }
});

/* статус сервера и число игроков — после отрисовки страницы */
const plural = n => n % 10 === 1 && n % 100 !== 11 ? 'игрок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'игрока' : 'игроков';
const loadStatus = () => fetch('https://api.mcsrvstat.us/3/' + IP, { signal: AbortSignal.timeout(10000) })
  .then(r => { if (!r.ok) throw new Error('Status unavailable'); return r.json(); })
  .then(d => {
    const on = d && d.online, n = on && d.players ? d.players.online : 0;
    const box = document.getElementById('status');
    box.classList.toggle('off', !on);
    box.children[1].textContent = on ? 'Сервер онлайн' : 'Сервер оффлайн';
    document.getElementById('count').textContent = on ? '· ' + n + ' ' + plural(n) : '';
  })
  .catch(() => {
    document.getElementById('status').classList.add('off');
    document.getElementById('status').children[1].textContent = 'Статус недоступен';
  });
setTimeout(() => (window.requestIdleCallback || (f => f()))(loadStatus), 600);
