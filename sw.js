// 앱 화면 파일을 저장해 두어 인터넷이 약해도 빨리 열리게 합니다.
const CACHE = 'dogam-v2';
const SHELL = ['./', './index.html', './style.css', './app.js', './firebase-config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const RUNTIME_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // 앱 파일: 새 버전을 먼저 받고, 안 되면 저장본 사용
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
  } else if (RUNTIME_HOSTS.includes(url.hostname)) {
    // Firebase 라이브러리, 글꼴: 저장본 먼저
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    })));
  }
});
