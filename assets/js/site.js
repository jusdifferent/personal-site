// Smooth scrolling and headlines that rise in once.
(() => {
  const { gsap, ScrollTrigger, SplitText, Lenis } = window;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  // Lenis scrolls on the main thread, so the WebGL background moves in step with the page.
  if (Lenis) {
    const lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    // Prioritised so the page scrolls before the canvas draws in the same tick.
    gsap.ticker.add((time) => lenis.raf(time * 1000), false, true);
    gsap.ticker.lagSmoothing(0);
  }

  gsap.to('.hero__figure', {
    yPercent: 14,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  if (SplitText) {
    gsap.registerPlugin(SplitText);
    document.querySelectorAll('.split').forEach((el) => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'line',
        autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, {
          yPercent: 110,
          duration: 1.2,
          ease: 'expo.out',
          stagger: 0.08,
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        }),
      });
    });
  }

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
})();
