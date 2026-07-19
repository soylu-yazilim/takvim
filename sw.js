// Basit çevrimdışı önbellek — sürüm numarasını artırınca eski önbellek temizlenir
const SURUM = "takvim-v1";
const DOSYALAR = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SURUM).then(c => c.addAll(DOSYALAR)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SURUM).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Önce ağdan dene (güncel sürüm gelsin), olmazsa önbellekten ver
self.addEventListener("fetch", e => {
  e.respondWith(
    fetch(e.request).then(cevap => {
      const kopya = cevap.clone();
      caches.open(SURUM).then(c => c.put(e.request, kopya));
      return cevap;
    }).catch(() => caches.match(e.request))
  );
});
