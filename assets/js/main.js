// =====================================
// Beslyfe
// main.js
// =====================================

function enterFestival() {
  const overlay = document.getElementById('welcome-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  localStorage.setItem('beslyfe_entered', '1');
}

// Timezone-explicit event date. Late September in Erie, PA is Eastern Daylight
// Time (UTC-04:00), not standard time — using -05:00 made the countdown an hour off.
const targetDate = new Date('2026-09-26T10:00:00-04:00');

function updateCountdown() {
  const countdown = document.getElementById('countdown');
  if (!countdown) return;

  const diff = targetDate - new Date();

  if (diff <= 0) {
    countdown.textContent = 'EVENT IS LIVE';
    return;
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  countdown.textContent = `${days} DAYS • ${hours} HRS • ${minutes} MIN • ${seconds} SEC`;
}

function handleHeaderScroll() {
  const header = document.getElementById('siteHeader');
  if (!header) return;
  header.classList.toggle('scrolled', window.scrollY > 50);
}

function initMobileMenu() {
  const menuToggle = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');
  if (!menuToggle || !navLinks) return;

  const firstLink = navLinks.querySelector('a');

  const setOpen = (open) => {
    navLinks.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');

    if (open && firstLink) {
      firstLink.focus();
    }
  };

  menuToggle.addEventListener('click', () => {
    const isOpen = !navLinks.classList.contains('open');
    setOpen(isOpen);
  });

  navLinks.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      menuToggle.focus();
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (!navLinks.contains(target) && !menuToggle.contains(target)) {
      setOpen(false);
    }
  });
}

function initRevealAnimations() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const revealSelector = [
    '[data-reveal]',
    '.card',
    '.stat',
    '.showcase-card',
    '.speaker-spotlight',
    '.schedule-item'
  ].join(',');
  const elements = document.querySelectorAll(revealSelector);
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.14 });

  elements.forEach((element) => {
    element.classList.add('reveal-item');
    observer.observe(element);
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#') {
        e.preventDefault();
        return;
      }

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();

      const header = document.getElementById('siteHeader');
      const headerHeight = header ? (header.offsetHeight + 10) : 0;
      const targetTop = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  });
}

function initHomepage() {
  const overlay = document.getElementById('welcome-overlay');
  if (localStorage.getItem('beslyfe_entered') === '1' && overlay) {
    overlay.style.display = 'none';
  }

  // The homepage background, overlay and theme are applied by
  // homepage-admin-state.js from the published site-settings document.
  updateCountdown();
  setInterval(updateCountdown, 1000);

  initMobileMenu();
  initRevealAnimations();
  initSmoothScroll();
  handleHeaderScroll();
}

window.addEventListener('DOMContentLoaded', initHomepage);
window.addEventListener('scroll', handleHeaderScroll, { passive: true });
