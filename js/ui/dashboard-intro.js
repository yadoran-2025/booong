let disposeIntro;

export function renderHomeIntro() {
  return `
    <section class="home-intro" aria-labelledby="home-intro-title">
      <div class="home-intro__stage">
        <div class="home-intro__art" aria-hidden="true">
          <img class="home-intro__landscape" src="assets/intro-city.jpg" width="1586" height="992" alt="" fetchpriority="high">
          <img class="home-intro__scooter" data-src="assets/intro-scooter.png" width="1374" height="1145" alt="">
        </div>
        <header class="home-intro__header">
          <a class="curation-brand" href="index.html" aria-label="BOOONG 홈"><img src="assets/favicon.svg" width="44" height="44" alt=""><b>BOOONG</b></a>
          <nav aria-label="첫 화면 빠른 이동"><a href="#lesson-library" data-intro-skip>수업 바로 보기 ↓</a><a href="index.html?view=favorites">내 수업함</a></nav>
        </header>
        <div class="home-intro__copy">
          <span class="home-intro__eyebrow">사회교육공동체 booong</span>
          <h1 id="home-intro-title">함께 가면,<br>더 멀리 간다</h1>
          <blockquote class="home-intro__quote"><p>“타자를 돕고, 타자로서 돕고, 타자를 돕는 일을 도우며,<br>미래-타자의 출현에 열린 지식과 기술은 어떤 얼굴일까.”</p>
            <cite>— 김원영·김초엽, 『사이보그가 되다』, 사계절, 2021</cite></blockquote>
          <div class="home-intro__actions">
            <a class="btn btn--primary home-intro__start" href="#lesson-library" data-intro-skip>수업 둘러보기 ↓</a>
            <a class="btn btn--secondary home-intro__start" href="index.html?view=favorites">내 수업함</a>
          </div>
        </div>
        <a class="home-intro__credit" href="assets/models/credits.txt" target="_blank" rel="noopener">BOOONG Scooter · Three.js</a>
        <a class="home-intro__scroll" href="#lesson-library" data-intro-skip>스크롤해서 수업 만나기 <span aria-hidden="true">↓</span></a>
      </div>
    </section>`;
}

export function bindHomeIntro(root) {
  disposeIntro?.();
  const section = root.querySelector(".home-intro");
  const stage = root.querySelector(".home-intro__stage");
  const art = root.querySelector(".home-intro__art");
  const landscape = root.querySelector(".home-intro__landscape");
  const library = root.querySelector("#lesson-library");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const controller = new AbortController();
  let frame = 0;
  let progress = 0;
  let previousTime = 0;
  let rider;
  let riderLoading = false;

  function update(time) {
    frame = 0;
    if (!section.isConnected) { disposeIntro(); return; }
    const bounds = section.getBoundingClientRect();
    const distance = section.offsetHeight - stage.offsetHeight;
    const target = motion.matches ? 0 : Math.max(0, Math.min(1, -bounds.top / Math.max(1, distance)));
    const dt = previousTime ? Math.min(.1, (time - previousTime) / 1000) : 1 / 60;
    previousTime = time;
    progress = motion.matches ? 0 : target + (progress - target) * Math.exp(-10 * dt);
    if (Math.abs(progress - target) < .0001) progress = target;
    if (!document.hidden && bounds.bottom > 0 && bounds.top < window.innerHeight) {
      loadRider();
      rider?.render(progress);
    }
    section.dataset.rideProgress = progress.toFixed(3);
    if (!document.hidden && bounds.bottom > 0 && progress !== target) frame = requestAnimationFrame(update);
  }

  function schedule() {
    if (!frame) { previousTime = 0; frame = requestAnimationFrame(update); }
  }

  window.addEventListener("scroll", schedule, { passive: true, signal: controller.signal });
  window.addEventListener("resize", schedule, { passive: true, signal: controller.signal });
  motion.addEventListener("change", schedule, { signal: controller.signal });
  landscape.addEventListener("load", schedule, { signal: controller.signal });
  root.querySelectorAll("[data-intro-skip]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    library.scrollIntoView({ behavior: motion.matches ? "instant" : "smooth", block: "start" });
    history.replaceState(null, "", "#lesson-library");
  }, { signal: controller.signal }));
  disposeIntro = () => { controller.abort(); cancelAnimationFrame(frame); };
  document.addEventListener("visibilitychange", schedule, { signal: controller.signal });
  function loadRider() {
    if (riderLoading) return;
    riderLoading = true;
    import("./intro-scooter.js").then(module => module.createIntroScooter(art, controller.signal)).then(value => {
      if (controller.signal.aborted) return;
      rider = value;
      schedule();
    }).catch(error => {
      if (controller.signal.aborted) return;
      const fallback = art.querySelector(".home-intro__scooter");
      fallback.src = fallback.dataset.src;
      art.dataset.renderer = "fallback";
      console.warn("BOOONG intro: 3D unavailable; keeping the parked scooter.", error);
    });
  }
  schedule();
  if (location.hash === "#lesson-library") library.scrollIntoView({ block: "start" });
}
