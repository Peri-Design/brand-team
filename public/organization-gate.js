'use strict';
document.querySelectorAll('[data-locale]').forEach(button => {
  button.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('ui', button.dataset.locale);
    try { localStorage.setItem('pixverse-ui-language', button.dataset.locale); } catch {}
    location.href = url.pathname + url.search + url.hash;
  });
});
