const VERSION="helpeo-shell-20261025-helpeo4";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil((async()=>{for(const key of await caches.keys())await caches.delete(key);await self.clients.claim()})()));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  event.respondWith(fetch(new Request(event.request,{cache:"no-store"})).catch(()=>fetch(event.request)));
});
