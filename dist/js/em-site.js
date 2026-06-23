// em-site.js — спільні скрипти сайту (гамбургер-меню, FAQ-акордеон, лайтбокс галереї)

document.addEventListener('DOMContentLoaded', () => {

  /* ===== Гамбургер-меню ===== */
  const burger = document.querySelector('.em-burger');
  const mobileNav = document.querySelector('.em-mobile-nav');
  if (burger && mobileNav) {
    burger.addEventListener('click', () => {
      const isOpen = burger.classList.toggle('open');
      mobileNav.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(isOpen));
    });
  }

  /* ===== FAQ-акордеон ===== */
  document.querySelectorAll('.em-faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.em-faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.em-faq-item.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.em-faq-question').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ===== Розкривачі розділів мобільного меню (Продукція / Послуги) =====
     На відміну від FAQ, можуть бути відкриті обидва одночасно. */
  document.querySelectorAll('.em-mobile-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen = btn.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
      const sub = document.getElementById(btn.getAttribute('aria-controls'));
      if (sub) sub.classList.toggle('open', isOpen);
    });
  });

  /* ===== Лайтбокс з листанням (←/→, свайп, нескінченний цикл) ===== */
  const lightbox = document.querySelector('.em-lightbox');
  const lightboxImg = document.querySelector('.em-lightbox-img');
  const lightboxCaption = document.querySelector('.em-lightbox-caption');
  const lightboxClose = document.querySelector('.em-lightbox-close');
  const lightboxPrev = document.querySelector('.em-lightbox-prev');
  const lightboxNext = document.querySelector('.em-lightbox-next');

  let lbItems = []; // масив {src, caption}
  let lbIndex = 0;

  function emBuildItems() {
    lbItems = [];
    document.querySelectorAll('.em-gallery-item').forEach(item => {
      const full = item.getAttribute('data-full');
      if (full) lbItems.push({ src: full, caption: item.getAttribute('data-caption') || '' });
    });
  }

  function emShowSlide(idx) {
    if (!lightboxImg || lbItems.length === 0) return;
    lbIndex = ((idx % lbItems.length) + lbItems.length) % lbItems.length; // нескінченний цикл
    lightboxImg.src = lbItems[lbIndex].src;
    lightboxImg.alt = lbItems[lbIndex].caption;
    if (lightboxCaption) lightboxCaption.textContent = lbItems[lbIndex].caption;
  }

  function emOpenLightbox(startIdx) {
    if (!lightbox) return;
    emBuildItems();
    emShowSlide(startIdx);
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function emCloseLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Клік по картці галереї
  document.querySelectorAll('.em-gallery-item').forEach((item, i) => {
    const full = item.getAttribute('data-full');
    if (!full) return;
    item.addEventListener('click', () => emOpenLightbox(i));
  });

  if (lightboxClose) lightboxClose.addEventListener('click', emCloseLightbox);
  if (lightboxPrev) lightboxPrev.addEventListener('click', (e) => { e.stopPropagation(); emShowSlide(lbIndex - 1); });
  if (lightboxNext) lightboxNext.addEventListener('click', (e) => { e.stopPropagation(); emShowSlide(lbIndex + 1); });

  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target === lightboxImg) emCloseLightbox();
    });
  }

  // Клавіатура
  document.addEventListener('keydown', (e) => {
    if (!lightbox || !lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') emCloseLightbox();
    if (e.key === 'ArrowLeft') emShowSlide(lbIndex - 1);
    if (e.key === 'ArrowRight') emShowSlide(lbIndex + 1);
  });

  // Свайп на мобільному
  let tsX = 0;
  if (lightbox) {
    lightbox.addEventListener('touchstart', (e) => { tsX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - tsX;
      if (Math.abs(dx) > 50) emShowSlide(lbIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

});
