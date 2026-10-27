/* CollectView Webseite: Kopfzeile, Einblenden. Kein Tracking. */
(() => {
  document.documentElement.classList.add("js");
  const header = document.getElementById("site-header");
  const stage = document.getElementById("stage");
  const media = document.querySelector(".stage-media");
  const reduziert = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const onScroll = () => {
    if (stage) {
      const fest = scrollY > stage.offsetHeight - 80;
      header.classList.toggle("solid", fest);
      header.classList.toggle("hell", !fest);
      if (media && !reduziert) media.style.transform = `translateY(${scrollY * 0.12}px)`;
    }
  };
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll(".rv").forEach((el) => io.observe(el));
})();
