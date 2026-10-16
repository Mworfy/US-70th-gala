(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Spring with Apple's designer parameters: damping ratio and response (seconds).
  function spring({ from, to, velocity = 0, damping = 1, response = 0.4, onUpdate, onComplete }) {
    const stiffness = Math.pow((2 * Math.PI) / response, 2);
    const friction = (4 * Math.PI * damping) / response;
    let x = from;
    let v = velocity;
    let last = performance.now();
    let raf = 0;
    let stopped = false;

    function frame(now) {
      if (stopped) return;
      let dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      while (dt > 0) {
        const step = Math.min(dt, 1 / 240);
        const force = -stiffness * (x - to) - friction * v;
        v += force * step;
        x += v * step;
        dt -= step;
      }
      if (Math.abs(v) < 2 && Math.abs(x - to) < 0.3) {
        onUpdate(to);
        onComplete && onComplete();
        return;
      }
      onUpdate(x);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return {
      stop() { stopped = true; cancelAnimationFrame(raf); },
      get value() { return x; },
      get velocity() { return v; },
    };
  }

  // Exponential decay projection from Designing Fluid Interfaces.
  const project = (velocity, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

  function rubberband(overshoot, dimension, constant = 0.55) {
    return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
  }

  /* Portal carousel inside the 0 */
  const portal = document.querySelector("[data-portal]");
  if (portal) {
    const windowEl = portal.querySelector(".portal-window");
    const track = portal.querySelector(".portal-track");
    const slides = [...track.children];
    const buttons = [...portal.querySelectorAll(".portal-years button")];
    const yearEl = portal.querySelector("[data-caption-year]");
    const textEl = portal.querySelector("[data-caption-text]");
    const last = slides.length - 1;

    let index = 0;
    let x = 0;
    let width = windowEl.clientWidth;
    let anim = null;

    const render = (value) => {
      x = value;
      track.style.transform = `translate3d(${value}px,0,0)`;
    };

    function setIndex(i) {
      index = i;
      buttons.forEach((b, n) => {
        b.setAttribute("aria-selected", String(n === i));
        b.tabIndex = n === i ? 0 : -1;
      });
      const slide = slides[i];
      yearEl.textContent = slide.dataset.year;
      textEl.textContent = slide.dataset.caption;
      slides.forEach((s, n) => s.setAttribute("aria-hidden", String(n !== i)));
    }

    function goTo(i, velocity = 0) {
      i = Math.max(0, Math.min(last, i));
      setIndex(i);
      const target = -i * width;
      anim && anim.stop();
      if (reduceMotion.matches) { render(target); return; }
      const flicked = Math.abs(velocity) > 300;
      anim = spring({
        from: x,
        to: target,
        velocity,
        damping: flicked ? 0.86 : 1,
        response: 0.42,
        onUpdate: render,
      });
    }

    buttons.forEach((b, n) => b.addEventListener("click", () => goTo(n)));

    portal.querySelector(".portal-years").addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = Math.max(0, Math.min(last, index + (e.key === "ArrowRight" ? 1 : -1)));
      goTo(next);
      buttons[next].focus();
    });
    windowEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
    });

    let drag = null;

    windowEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // Grab the slide mid flight: continue from its live position.
      if (anim) { anim.stop(); anim = null; }
      drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, origin: x, startIndex: index, history: [], locked: null };
      drag.history.push({ x: e.clientX, t: e.timeStamp });
    });

    windowEl.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (drag.locked === null) {
        if (Math.hypot(dx, dy) < 8) return;
        drag.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (drag.locked === "x") windowEl.setPointerCapture(e.pointerId);
      }
      if (drag.locked !== "x") return;

      let next = drag.origin + dx;
      const min = -last * width;
      if (next > 0) next = rubberband(next, width);
      else if (next < min) next = min + rubberband(next - min, width);
      render(next);

      drag.history.push({ x: e.clientX, t: e.timeStamp });
      if (drag.history.length > 6) drag.history.shift();
    });

    function release(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (d.locked !== "x") {
        if (d.locked === null && x !== -index * width) goTo(index);
        return;
      }
      const h = d.history;
      const a = h[0];
      const b = h[h.length - 1];
      const dt = Math.max(b.t - a.t, 1);
      const velocity = ((b.x - a.x) / dt) * 1000;

      const projected = x + project(velocity);
      let target = Math.round(-projected / width);
      target = Math.max(d.startIndex - 1, Math.min(d.startIndex + 1, target));
      goTo(target, velocity);
    }
    windowEl.addEventListener("pointerup", release);
    windowEl.addEventListener("pointercancel", release);

    new ResizeObserver(() => {
      width = windowEl.clientWidth;
      anim && anim.stop();
      render(-index * width);
    }).observe(windowEl);

    setIndex(0);
  }

  /* Top bar turns light once the dark hero has scrolled away */
  const topbar = document.querySelector(".topbar");
  const hero = document.querySelector(".hero");
  if (topbar && hero) {
    new IntersectionObserver(
      ([entry]) => topbar.classList.toggle("is-light", !entry.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 }
    ).observe(hero);
  }

  /* Mobile menu, anchored to its button */
  const toggle = document.querySelector(".menu-toggle");
  const panel = document.querySelector(".menu-panel");
  if (toggle && panel) {
    const setOpen = (open) => {
      panel.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      panel.inert = !open;
    };
    setOpen(false);
    toggle.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
    panel.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
    document.addEventListener("pointerdown", (e) => {
      if (panel.classList.contains("is-open") && !panel.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
  }

  /* Count the stats up once, when they come into view */
  const counters = [...document.querySelectorAll("[data-count]")];
  if (counters.length && !reduceMotion.matches) {
    const fmt = new Intl.NumberFormat("en-US");
    counters.forEach((el) => { el.dataset.final = el.textContent; el.textContent = "0" + (el.dataset.suffix || ""); });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const el = entry.target;
        const end = Number(el.dataset.count);
        const suffix = el.dataset.suffix || "";
        const start = performance.now();
        const duration = 1400;
        const tick = (now) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 4);
          el.textContent = fmt.format(Math.round(end * eased)) + suffix;
          if (t < 1) requestAnimationFrame(tick);
          else el.textContent = el.dataset.final;
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => io.observe(el));
  }

  const year = document.querySelector("[data-year-now]");
  if (year) year.textContent = new Date().getFullYear();
})();
