// Page motion: smooth scrolling, scroll-driven reveals, the menu, and the nav's light/dark switch.
(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav = document.querySelector('.nav');
  const menu = document.getElementById('menu');
  const menuButton = document.querySelector('.nav__menu');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const themed = [...document.querySelectorAll('main > [data-theme]')];
  const { gsap, ScrollTrigger, SplitText, Lenis } = window;
  const hasGsap = Boolean(gsap && ScrollTrigger);

  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  // ---------- Smooth scrolling ----------

  let lenis = null;
  if (!reduceMotion && Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      // Prioritised so the page scrolls before the WebGL canvas draws in the same tick.
      gsap.ticker.add((time) => lenis.raf(time * 1000), false, true);
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }
  }

  // ---------- Menu ----------

  function setMenu(open) {
    if (!menu || !menuButton) return;
    menu.classList.toggle('is-open', open);
    nav.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) lenis?.stop();
    else lenis?.start();
    if (open && hasGsap && !reduceMotion) {
      gsap.fromTo('.menu__links li', { yPercent: 70, opacity: 0 }, {
        yPercent: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.05, delay: 0.2,
      });
    }
  }

  if (menu && menuButton) {
    menu.removeAttribute('hidden');
    menuButton.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.classList.contains('is-open')) {
        setMenu(false);
        menuButton.focus();
      }
    });
  }

  // ---------- In-page links ----------

  document.querySelectorAll('a[href^="#"]:not(.skip)').forEach((link) => {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');
      const target = hash === '#top' ? 0 : document.querySelector(hash);
      if (target === null) return;
      event.preventDefault();
      setMenu(false);
      if (lenis) lenis.scrollTo(target, { duration: 1.6 });
      else if (target === 0) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      history.replaceState(null, '', hash === '#top' ? location.pathname : hash);
    });
  });

  // ---------- Nav colour follows the section underneath it ----------

  let navTheme = 'light';
  function updateNavTheme() {
    const probe = nav.offsetHeight / 2;
    let theme = 'light';
    for (const section of themed) {
      const box = section.getBoundingClientRect();
      if (box.top <= probe && box.bottom > probe) {
        theme = section.dataset.theme === 'dark' ? 'dark' : 'light';
        if (themeMeta) themeMeta.content = { dark: '#282c20', lime: '#d2ff00' }[section.dataset.theme] || '#f4f4ed';
        break;
      }
    }
    if (theme !== navTheme) {
      navTheme = theme;
      nav.dataset.theme = theme;
    }
  }
  window.addEventListener('scroll', updateNavTheme, { passive: true });
  updateNavTheme();

  if (!hasGsap) {
    root.classList.add('ready');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  if (SplitText) gsap.registerPlugin(SplitText);
  root.classList.add('ready');
  if (reduceMotion) return;
  root.classList.add('motion');

  // ---------- Intro ----------

  gsap.from('.nav .intro', { yPercent: -80, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: 0.08, delay: 0.5 });
  gsap.from('.hero .intro', { y: 24, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: 0.1, delay: 1.4 });

  // ---------- Hero ----------

  gsap.to('.hero__figure', {
    yPercent: 14,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  // ---------- Competition is a sin ----------

  gsap.utils.toArray('.sin .row__track').forEach((track, i) => {
    const forward = i % 2 === 0;
    gsap.fromTo(track, { xPercent: forward ? 0 : -30 }, {
      xPercent: forward ? -30 : 0,
      ease: 'none',
      scrollTrigger: { trigger: '.sin', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  gsap.from('.sin__card', {
    scale: 0.72,
    ease: 'none',
    scrollTrigger: { trigger: '.sin', start: 'top bottom', end: 'center center', scrub: true },
  });

  const signature = gsap.timeline({
    scrollTrigger: { trigger: '.sin', start: 'top 45%', end: 'center 30%', scrub: 0.6 },
  });
  gsap.utils.toArray('.sig path').forEach((path, i) => {
    signature.to(path, { strokeDashoffset: 0, ease: 'none', duration: [1.6, 0.9, 0.6][i] ?? 1 });
  });

  // ---------- Headlines rise line by line ----------

  if (SplitText) {
    document.querySelectorAll('.split').forEach((el) => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'line',
        autoSplit: true,
        onSplit(self) {
          return gsap.from(self.lines, {
            yPercent: 110,
            duration: 1.25,
            ease: 'expo.out',
            stagger: 0.08,
            scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          });
        },
      });
    });

    SplitText.create('.split-chars', {
      type: 'chars',
      mask: 'chars',
      onSplit(self) {
        return gsap.from(self.chars, {
          yPercent: 110,
          duration: 1.3,
          ease: 'expo.out',
          stagger: 0.05,
          scrollTrigger: { trigger: '.tldr', start: 'top 75%', once: true },
        });
      },
    });
  }

  // ---------- Track record ----------

  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const state = { value: 0 };
    el.textContent = `${prefix}0${suffix}`;
    gsap.to(state, {
      value: end,
      duration: 1.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onUpdate: () => { el.textContent = `${prefix}${Math.round(state.value)}${suffix}`; },
    });
  });

  gsap.from('.stat', {
    y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1,
    scrollTrigger: { trigger: '.stats', start: 'top 85%', once: true },
  });

  // ---------- Now building ----------

  gsap.from('.project', {
    y: 50, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12,
    scrollTrigger: { trigger: '.projects', start: 'top 85%', once: true },
  });

  // ---------- Beliefs light up as they reach reading height ----------

  gsap.utils.toArray('.beliefs__list li').forEach((item) => {
    gsap.fromTo(item, { opacity: 0.16 }, {
      opacity: 1,
      ease: 'none',
      scrollTrigger: { trigger: item, start: 'top 92%', end: 'top 62%', scrub: true },
    });
  });

  // ---------- Where it started ----------

  gsap.fromTo('.cd', { rotate: -120 }, {
    rotate: 240,
    ease: 'none',
    scrollTrigger: { trigger: '.story', start: 'top bottom', end: 'bottom top', scrub: 0.4 },
  });
  gsap.from('.story__item', {
    y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12,
    scrollTrigger: { trigger: '.story__items', start: 'top 80%', once: true },
  });

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
})();
