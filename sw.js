/* ============================================================
   生信四年作战手册 · Service Worker（文件版）
   离线缓存策略：
     - 导航请求（index.html）→ 网络优先，保证总是最新版
     - 静态资源（manifest.json 等）→ 缓存优先
     - 网络失败 → 回退缓存首页（离线兜底）
   版本号递增触发 SW 重装，清掉旧缓存。改 index.html 后记得同步递增。
   ============================================================ */

const CACHE_NAME = 'shengxin-handbook-v4.5';
const urlsToCache = [
  './',
  'manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // 仅处理同源 GET 请求
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // 导航请求（index.html）走网络优先：保证每次打开都是最新版，避免"改了代码但手机还是旧版"
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(netResp => {
          if (netResp && netResp.status === 200) {
            const clone = netResp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            return netResp;
          }
          return caches.match(e.request);
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  // 静态资源走缓存优先
  e.respondWith(
    caches.match(e.request).then(resp => {
      if (resp) return resp;
      return fetch(e.request).then(netResp => {
        if (!netResp || netResp.status !== 200 || netResp.type !== 'basic') return netResp;
        const clone = netResp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return netResp;
      }).catch(() => {
        // 网络失败时返回缓存首页（离线兜底）
        return caches.match('./');
      });
    })
  );
});

self.addEventListener('sync', e => {
  if (e.tag === 'sync-handbook-data') {
    e.waitUntil(self.syncDataToGist());
  }
});

self.syncDataToGist = async () => {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type: 'TRIGGER_GIST_SYNC' });
  });
};
