/**
 * Interactive logic for Recoda Landing Page.
 * Handles scroll reveal, mobile menu, and waitlist form submission.
 */

document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initMobileMenu();
  initWaitlist();
  initFAQ();
});

// 1. Scroll Reveal Animations
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  // Add scroll-reveal class to major sections or elements?
  // Let's manually select key elements.
  const hiddenElements = document.querySelectorAll('.feature-card, .step-item, .pricing-card, .logo-item');
  hiddenElements.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(el);
  });
  
  // Custom observer callback to apply inline styles for 'visible'
  // Actually, let's use a class.
  // We need to inject the .visible class style into CSS or handle it here.
  // Simpler: Just handle it here.
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  hiddenElements.forEach(el => revealObserver.observe(el));

  // Navbar Frost Effect
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// 2. Mobile Menu Toggle
function initMobileMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.mobile-menu');
  
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
      // simple toggle. ideally animate height.
      if (menu.style.display === 'flex') {
        menu.classList.add('active');
        toggle.innerHTML = '<i data-lucide="x"></i>';
      } else {
        menu.classList.remove('active');
        toggle.innerHTML = '<i data-lucide="menu"></i>';
      }
      if (window.lucide) lucide.createIcons();
    });
  }
}

// 3. Waitlist Form Submission
function initWaitlist() {
  const form = document.querySelector('#waitlist-form');
  const successMsg = document.querySelector('#waitlist-success');
  
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = form.querySelector('#email');
      const btn = form.querySelector('button');
      const email = emailInput.value;

      btn.disabled = true;
      btn.textContent = 'Joining...';

      try {
        const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
        const res = await fetch(`${API_BASE}/api/waitlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        if (res.ok) {
          form.style.display = 'none';
          successMsg.style.display = 'flex';
        } else {
          alert('Something went wrong. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Join Waitlist';
        }
      } catch (err) {
        console.error('Waitlist error:', err);
        alert('Could not connect to server. Check your connection.');
        btn.disabled = false;
        btn.textContent = 'Join Waitlist';
      }
    });
  }
}

// 4. FAQ Logic (Already handled by <details>, but add smooth close others?)
function initFAQ() {
  const details = document.querySelectorAll('details');
  details.forEach(targetDetail => {
    targetDetail.addEventListener('click', () => {
      details.forEach(detail => {
        if (detail !== targetDetail) {
          detail.removeAttribute('open');
        }
      });
    });
  });
}
