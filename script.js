(() => {
  const GALA_DATE = "2026-10-17";
  const TZ = "America/Chicago";

  const decadeColors = ["--d1980", "--d1960", "--d1970", "--d2000", "--d1990", "--d2020"];
  const grid = document.querySelector(".dots-grid");
  if (grid) {
    for (let i = 0; i < 70; i++) {
      const dot = document.createElement("span");
      const isWhite = i % 3 !== 0;
      dot.style.setProperty("--dot", isWhite ? "rgba(255,255,255,0.92)" : `var(${decadeColors[(i / 3) % decadeColors.length | 0]})`);
      grid.appendChild(dot);
    }
  }

  const topbar = document.querySelector(".topbar");
  const onScroll = () => topbar.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const navLinks = [...document.querySelectorAll(".topbar-nav a")];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${entry.target.id}`));
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((s) => observer.observe(s));

  const items = [...document.querySelectorAll(".schedule li[data-start]")];
  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  function chicagoNow() {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date()).map((p) => [p.type, p.value])
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }

  function markProgram() {
    const params = new URLSearchParams(location.search);
    const preview = params.get("now");
    const now = preview ? { date: GALA_DATE, minutes: toMinutes(preview) } : chicagoNow();

    items.forEach((li) => li.classList.remove("is-now", "is-past"));
    if (now.date !== GALA_DATE) return;

    items.forEach((li, i) => {
      const start = toMinutes(li.dataset.start);
      const next = items[i + 1];
      const end = next ? toMinutes(next.dataset.start) : toMinutes(li.dataset.end || "23:59");
      if (now.minutes >= start && now.minutes < end) li.classList.add("is-now");
      else if (now.minutes >= end) li.classList.add("is-past");
    });
  }

  markProgram();
  setInterval(markProgram, 30000);
})();
