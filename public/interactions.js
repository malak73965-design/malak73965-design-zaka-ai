(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function announce(message) {
    const region = $('#toastWrap');
    if (!region || !message) return;
    const item = document.createElement('div');
    item.className = 'toast success';
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 2600);
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) $('#sidebar')?.classList.remove('open');
  }

  function enhanceTabs() {
    $$('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.mode-tab').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
        closeSidebarOnMobile();
      });
    });
  }

  function addKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#chatInput')?.focus();
      }
      if (event.key === 'Escape') {
        $$('.modal-backdrop').forEach((modal) => modal.classList.add('hidden'));
        $('#sidebar')?.classList.remove('open');
      }
    });
  }

  function addMotionObserver() {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      });
    }, { threshold: .08 });
    $$('.panel, .hero-card').forEach((element) => observer.observe(element));
  }

  function improveErrors() {
    window.addEventListener('offline', () => announce('انقطع الاتصال بالإنترنت'));
    window.addEventListener('online', () => announce('عاد الاتصال بالإنترنت'));
  }

  function init() {
    enhanceTabs();
    addKeyboardShortcuts();
    addMotionObserver();
    improveErrors();
    $$('.history-item').forEach((item) => item.addEventListener('click', closeSidebarOnMobile));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
