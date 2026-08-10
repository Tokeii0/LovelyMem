const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1081px)');
const forceMotion = document.documentElement.classList.contains('force-motion');
let motionEnabled = forceMotion || !motionQuery.matches;

const intro = document.querySelector<HTMLElement>('[data-intro]');

const dismissIntro = (): void => {
  intro?.remove();
};

if (!motionEnabled || document.documentElement.classList.contains('skip-intro')) {
  dismissIntro();
} else {
  try {
    sessionStorage.setItem('lovelymem-showcase-intro-seen', '1');
  } catch {
    // Storage can be disabled without affecting the page.
  }

  intro?.addEventListener('animationend', (event) => {
    if (event.animationName === 'intro-finish') dismissIntro();
  });
  window.setTimeout(dismissIntro, 2000);
}

const header = document.querySelector<HTMLElement>('[data-header]');
const scrollProgress = document.querySelector<HTMLElement>('[data-scroll-progress]');
const nav = document.querySelector<HTMLElement>('[data-nav]');
const navToggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
const navToggleLabel = navToggle?.querySelector<HTMLElement>('.sr-only');
const navLinks = Array.from(nav?.querySelectorAll<HTMLAnchorElement>('a[href^="#"]') ?? []);

const setMenuOpen = (open: boolean): void => {
  if (!nav || !navToggle) return;
  nav.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  if (navToggleLabel) navToggleLabel.textContent = open ? '关闭导航' : '打开导航';
};

navToggle?.addEventListener('click', () => {
  setMenuOpen(navToggle.getAttribute('aria-expanded') !== 'true');
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setMenuOpen(false));
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || navToggle?.getAttribute('aria-expanded') !== 'true') return;
  setMenuOpen(false);
  navToggle.focus();
});

document.addEventListener('click', (event) => {
  const target = event.target as Node;
  if (nav?.contains(target) || navToggle?.contains(target)) return;
  setMenuOpen(false);
});

let viewportFrame = 0;

const renderViewportState = (): void => {
  viewportFrame = 0;
  const scrollTop = Math.max(window.scrollY, document.documentElement.scrollTop);
  const scrollRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const progress = Math.min(1, Math.max(0, scrollTop / scrollRange));

  header?.classList.toggle('is-scrolled', scrollTop > 18);
  if (scrollProgress) scrollProgress.style.transform = `scaleX(${progress})`;
  if (scrollTop < 80) navLinks.forEach((link) => link.classList.remove('is-active'));
};

const scheduleViewportRender = (): void => {
  if (viewportFrame !== 0) return;
  viewportFrame = window.requestAnimationFrame(renderViewportState);
};

renderViewportState();
window.addEventListener('scroll', scheduleViewportRender, { passive: true });
window.addEventListener('resize', scheduleViewportRender, { passive: true });

const countItems = document.querySelectorAll<HTMLElement>('[data-count]');

const finishCount = (item: HTMLElement): void => {
  item.textContent = item.dataset.count ?? item.textContent;
  item.dataset.counted = 'true';
};

const startCount = (item: HTMLElement): void => {
  if (item.dataset.counted === 'true') return;
  const finalValue = Number.parseInt(item.dataset.count ?? '', 10);
  if (!motionEnabled || !Number.isFinite(finalValue)) {
    finishCount(item);
    return;
  }

  item.dataset.counted = 'true';
  item.textContent = '0';
  const startedAt = performance.now();
  const duration = 820;

  const step = (now: number): void => {
    if (!motionEnabled) {
      finishCount(item);
      return;
    }

    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    item.textContent = String(Math.round(finalValue * eased));
    if (progress < 1) window.requestAnimationFrame(step);
  };

  window.requestAnimationFrame(step);
};

const revealItems = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));

const revealImmediately = (): void => {
  revealItems.forEach((item) => {
    item.classList.remove('is-pending');
    item.classList.add('is-visible');
    item.querySelectorAll<HTMLElement>('[data-count]').forEach(finishCount);
  });
};

if (!motionEnabled || !('IntersectionObserver' in window)) {
  revealImmediately();
} else {
  revealItems.forEach((item) => item.classList.add('is-pending'));

  try {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const item = entry.target as HTMLElement;
          item.classList.add('is-visible');
          item.querySelectorAll<HTMLElement>('[data-count]').forEach(startCount);
          revealObserver.unobserve(item);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    revealItems.forEach((item) => revealObserver.observe(item));
  } catch {
    revealImmediately();
  }
}

const sectionLinks = new Map<Element, HTMLAnchorElement>();

navLinks.forEach((link) => {
  const id = link.hash.slice(1);
  const section = id ? document.getElementById(id) : null;
  if (section) sectionLinks.set(section, link);
});

if ('IntersectionObserver' in window && sectionLinks.size > 0) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => link.classList.remove('is-active'));
      sectionLinks.get(visible.target)?.classList.add('is-active');
    },
    { rootMargin: '-28% 0px -58% 0px', threshold: [0, 0.2, 0.55] },
  );

  sectionLinks.forEach((_link, section) => sectionObserver.observe(section));
}

const cursorAura = document.querySelector<HTMLElement>('[data-cursor-aura]');
let auraFrame = 0;
let pointerX = 0;
let pointerY = 0;

const canUseFineMotion = (): boolean => motionEnabled && finePointerQuery.matches;

document.addEventListener(
  'pointermove',
  (event) => {
    if (!cursorAura || !canUseFineMotion()) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    cursorAura.classList.add('is-active');
    if (auraFrame !== 0) return;
    auraFrame = window.requestAnimationFrame(() => {
      auraFrame = 0;
      cursorAura.style.transform = `translate3d(${pointerX - 170}px, ${pointerY - 170}px, 0)`;
    });
  },
  { passive: true },
);

document.documentElement.addEventListener('pointerleave', () => {
  cursorAura?.classList.remove('is-active');
});

const workbenchSurface = document.querySelector<HTMLElement>('[data-workbench]');
const workbench = workbenchSurface?.querySelector<HTMLElement>('.workbench');
let workbenchRect: DOMRect | null = null;
let workbenchFrame = 0;
let workbenchPointerX = 0;
let workbenchPointerY = 0;

const resetWorkbench = (): void => {
  workbenchRect = null;
  workbench?.classList.remove('is-tilting');
  workbench?.style.setProperty('--tilt-x', '0.35deg');
  workbench?.style.setProperty('--tilt-y', '-1deg');
  workbench?.style.setProperty('--workbench-x', '50%');
  workbench?.style.setProperty('--workbench-y', '35%');
};

workbenchSurface?.addEventListener('pointerenter', () => {
  if (!canUseFineMotion()) return;
  workbenchRect = workbenchSurface.getBoundingClientRect();
  workbench?.classList.add('is-tilting');
});

workbenchSurface?.addEventListener(
  'pointermove',
  (event) => {
    if (!workbench || !workbenchRect || !canUseFineMotion()) return;
    workbenchPointerX = event.clientX;
    workbenchPointerY = event.clientY;
    if (workbenchFrame !== 0) return;
    workbenchFrame = window.requestAnimationFrame(() => {
      workbenchFrame = 0;
      if (!workbenchRect) return;
      const x = Math.min(1, Math.max(0, (workbenchPointerX - workbenchRect.left) / workbenchRect.width));
      const y = Math.min(1, Math.max(0, (workbenchPointerY - workbenchRect.top) / workbenchRect.height));
      workbench.style.setProperty('--tilt-x', `${(0.5 - y) * 1.8}deg`);
      workbench.style.setProperty('--tilt-y', `${(x - 0.5) * 2.4}deg`);
      workbench.style.setProperty('--workbench-x', `${x * 100}%`);
      workbench.style.setProperty('--workbench-y', `${y * 100}%`);
    });
  },
  { passive: true },
);

workbenchSurface?.addEventListener('pointerleave', resetWorkbench);

const featureCards = Array.from(document.querySelectorAll<HTMLElement>('.feature-card'));
let spotlightCard: HTMLElement | null = null;
let spotlightRect: DOMRect | null = null;
let spotlightFrame = 0;
let spotlightX = 0;
let spotlightY = 0;

featureCards.forEach((card) => {
  card.addEventListener('pointerenter', () => {
    if (!canUseFineMotion()) return;
    spotlightCard = card;
    spotlightRect = card.getBoundingClientRect();
  });

  card.addEventListener(
    'pointermove',
    (event) => {
      if (spotlightCard !== card || !spotlightRect || !canUseFineMotion()) return;
      spotlightX = event.clientX;
      spotlightY = event.clientY;
      if (spotlightFrame !== 0) return;
      spotlightFrame = window.requestAnimationFrame(() => {
        spotlightFrame = 0;
        if (!spotlightCard || !spotlightRect) return;
        spotlightCard.style.setProperty('--spot-x', `${spotlightX - spotlightRect.left}px`);
        spotlightCard.style.setProperty('--spot-y', `${spotlightY - spotlightRect.top}px`);
      });
    },
    { passive: true },
  );

  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--spot-x', '50%');
    card.style.setProperty('--spot-y', '50%');
    if (spotlightCard === card) {
      spotlightCard = null;
      spotlightRect = null;
    }
  });
});

const disableMotionEffects = (): void => {
  dismissIntro();
  revealImmediately();
  countItems.forEach(finishCount);
  cursorAura?.classList.remove('is-active');
  resetWorkbench();
};

motionQuery.addEventListener('change', (event) => {
  motionEnabled = forceMotion || !event.matches;
  if (!motionEnabled) disableMotionEffects();
});

finePointerQuery.addEventListener('change', () => {
  cursorAura?.classList.remove('is-active');
  resetWorkbench();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cursorAura?.classList.remove('is-active');
    resetWorkbench();
  }
});

document.querySelectorAll<HTMLElement>('[data-year]').forEach((item) => {
  item.textContent = String(new Date().getFullYear());
});
