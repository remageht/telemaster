/* ТЕЛЕМАСТЕР — service worker: сайт ставится как приложение и живёт офлайн.
   ВАЖНО: при смене ?v= у ассетов обновить список ASSETS и CACHE ниже. */
const CACHE = "tm-v97";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css?v=70",
  "./js/main.js?v=77",
  "./js/constellation.js?v=43",
  "./js/pcb-field.js?v=2",
  "./js/data.js?v=3",
  "./js/config.js",
  "./js/circuit-bg.js?v=7",
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
  // динамические API-ответы не кэшируем: иначе сток/заказы «залипают»
  if (new URL(req.url).pathname.startsWith("/api/")) return;

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

  // конфиг должен обновляться без бампа CACHE — network-first
  if (new URL(req.url).pathname.endsWith("/js/config.js")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
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
