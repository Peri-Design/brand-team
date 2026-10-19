'use strict';
document.querySelectorAll('[data-locale]').forEach(button => {
  button.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('ui', button.dataset.locale);
    try { localStorage.setItem('pixverse-ui-language', button.dataset.locale); } catch {}
    location.href = url.pathname + url.search + url.hash;
  });
});

const motionToggle = document.querySelector('[data-motion-toggle]');
if (motionToggle) {
  motionToggle.addEventListener('click', () => {
    const paused = motionToggle.getAttribute('aria-pressed') !== 'true';
    document.querySelector('[data-brand-character]')?.classList.toggle('paused', paused);
    motionToggle.setAttribute('aria-pressed', String(paused));
    const en = document.documentElement.lang === 'en';
    motionToggle.textContent = paused ? (en ? 'Play animation' : '播放动画') : (en ? 'Pause animation' : '暂停动画');
  });
}
