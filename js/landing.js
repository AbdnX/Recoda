/**
 * Interactive logic for Recoda Landing Page.
 * Handles scroll reveal, mobile menu, navbar frost, and waitlist form.
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScrollReveal();
  initMobileMenu();
  initWaitlist();
  initFAQ();
});

// ── 1. Navbar frost on scroll ────────────────────────────────
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ── 2. Scroll Reveal ─────────────────────────────────────────
function initScrollReveal() {
  // Hero elements get 'visible' immediately after a short delay
  // so the CSS reveal-d* delays can play on load.
  requestAnimationFrame(() => {
    document.querySelectorAll('.hero .reveal').forEach(el => {
      el.classList.add('visible');
    });
  });

  // Everything else fires on intersection
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal:not(.hero .reveal)').forEach(el => observer.observe(el));
}

// ── 3. Mobile menu ───────────────────────────────────────────
function initMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const menu   = document.getElementById('mobile-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    // Swap hamburger ↔ X icon
    const icon = toggle.querySelector('i');
    if (icon) icon.setAttribute('data-lucide', isOpen ? 'x' : 'menu');
    if (window.lucide) lucide.createIcons();
  });

  // Close menu when a link inside it is clicked
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      const icon = toggle.querySelector('i');
      if (icon) icon.setAttribute('data-lucide', 'menu');
      if (window.lucide) lucide.createIcons();
    });
  });
}

// ── 4. Waitlist Form ─────────────────────────────────────────
function initWaitlist() {
  const form       = document.getElementById('waitlist-form');
  const successMsg = document.getElementById('waitlist-success');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = form.querySelector('#email');
    const btn        = form.querySelector('button[type="submit"]');
    const email      = emailInput?.value?.trim();

    if (!email || !btn) return;

    btn.disabled       = true;
    btn.textContent    = 'Joining...';

    try {
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
      const res = await fetch(`${API_BASE}/api/waitlist`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });

      if (res.ok) {
        form.style.display = 'none';
        if (successMsg) successMsg.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
      } else {
        btn.disabled    = false;
        btn.textContent = 'Join waitlist';
        emailInput.style.borderColor = 'var(--accent)';
      }
    } catch {
      btn.disabled    = false;
      btn.textContent = 'Join waitlist';
      emailInput.style.borderColor = 'var(--accent)';
      emailInput.placeholder = 'Could not connect — try again.';
    }
  });
}

// ── 5. FAQ accordion (only one open at a time) ───────────────
function initFAQ() {
  const all = document.querySelectorAll('details');
  all.forEach(target => {
    target.addEventListener('toggle', () => {
      if (target.open) {
        all.forEach(other => { if (other !== target) other.removeAttribute('open'); });
      }
    });
  });
}
