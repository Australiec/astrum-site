/* Shared theme, applied before the first paint on the homepage and in the wiki. */
(() => {
  const root = document.documentElement;
  let initial = 'night';
  try {
    const saved = localStorage.getItem('astrum-sky');
    if (saved === 'day' || saved === 'night') initial = saved;
  } catch {}

  function apply(sky) {
    root.dataset.sky = sky;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sky === 'night' ? '#010101' : '#f7f6f2');
    const toggle = document.getElementById('sw');
    if (toggle) {
      toggle.setAttribute('aria-label', sky === 'night' ? 'Включить светлую тему' : 'Включить тёмную тему');
      toggle.setAttribute('aria-pressed', String(sky === 'night'));
      toggle.title = sky === 'night' ? 'Светлая тема' : 'Тёмная тема';
    }
  }

  apply(initial);
  document.addEventListener('DOMContentLoaded', () => apply(root.dataset.sky));
  document.addEventListener('click', event => {
    if (!event.target.closest('#sw')) return;
    const sky = root.dataset.sky === 'night' ? 'day' : 'night';
    apply(sky);
    try { localStorage.setItem('astrum-sky', sky); } catch {}
  });
  addEventListener('storage', event => {
    if (event.key === 'astrum-sky') apply(event.newValue === 'day' ? 'day' : 'night');
  });
})();
