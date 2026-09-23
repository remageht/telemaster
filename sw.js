/* ТЕЛЕМАСТЕР — service worker: сайт ставится как приложение и живёт офлайн.
   ВАЖНО: при смене ?v= у ассетов обновить список ASSETS и CACHE ниже. */
const CACHE = "tm-v86";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css?v=62",
  "./js/main.js?v=65",
  "./js/constellation.js?v=39",
  "./js/pcb-field.js?v=1",
  "./js/data.js?v=2",
  "./js/circuit-bg.js?v=6",
  "./img/icon-192.png",
  "./img/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    // cache:"reload" — не берём index.html и ассеты из HTTP-кэша браузера,
    // иначе в новый CACHE попадает старый HTML и проверка версий циклит
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  // навигация/HTML — всегда сеть (иначе обновления не доходят никогда),
  // офлайн-фолбэк на закэшированную оболочку
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // ассеты с ?v= не меняют содержимое — cache-first безопасен
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
    )
  );
});
