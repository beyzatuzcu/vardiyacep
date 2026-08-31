const CACHE="vardiyacep-v1.5.0";
const APP_SHELL=["./","./index.html","./styles.css?v=1.5.0","./app.js?v=1.5.0","./manifest.webmanifest","./sample-data.json","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  const isAppAsset=event.request.mode==="navigate" || /\.(?:js|css|html)$/.test(url.pathname);
  if(isAppAsset){
    event.respondWith(fetch(event.request,{cache:"no-store"}).then(response=>{
      const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return response;
    }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match("./index.html"))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response;})));
});
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open("vardiyacep-sw",1);req.onupgradeneeded=()=>req.result.createObjectStore("store");req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function put(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction("store","readwrite");tx.objectStore("store").put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function get(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction("store","readonly");const req=tx.objectStore("store").get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
self.addEventListener("message",event=>{if(event.data?.type==="SAVE_REMINDER")event.waitUntil(put("reminder",event.data.payload));});
function isoLocal(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
function addDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d;}
function infer(code,mappings){const map=mappings?.[code];if(map)return map;const k=String(code||"").toUpperCase().replaceAll("İ","I");let category="other";if(k.startsWith("S"))category="morning";else if(k.startsWith("A"))category="evening";else if(k.startsWith("G"))category="night";else if(/^(I|R)$/.test(k))category="off";else if(k.startsWith("Y"))category="annual";return {category,label:{morning:"Sabah vardiyası",evening:"Akşam vardiyası",night:"Gece vardiyası",off:"İzinli / Dinlenme",annual:"Yıllık izin",other:"Diğer görev"}[category]};}
async function checkReminder(){const data=await get("reminder");if(!data?.settings?.enabled||!data?.person)return;const now=new Date();const [h,m]=(data.settings.time||"20:00").split(":").map(Number);if(now.getHours()!==h||Math.abs(now.getMinutes()-m)>45)return;const key=`sent-${isoLocal(now)}`;if(await get(key))return;const tomorrow=addDays(now,1);const code=data.person.shifts?.[isoLocal(tomorrow)];if(!code)return;const map=infer(code,data.mappings);const title=map.category==="morning"?"Yarın sabahçısın ☀️":map.category==="evening"?"Yarın akşam vardiyasındasın":map.category==="night"?"Yarın gece vardiyasındasın 🌙":map.category==="off"?"Yarın izinlisin":map.category==="annual"?"Yarın yıllık izindesin":`Yarın: ${map.label}`;await self.registration.showNotification(title,{body:`Kod: ${code}${map.start?" • "+map.start+" başlangıç":""}`,icon:"icons/icon-192.png",badge:"icons/icon-192.png",tag:"vardiyacep-reminder"});await put(key,true);}
self.addEventListener("periodicsync",event=>{if(event.tag==="vardiyacep-daily")event.waitUntil(checkReminder());});
self.addEventListener("sync",event=>{if(event.tag==="vardiyacep-daily")event.waitUntil(checkReminder());});
self.addEventListener("notificationclick",event=>{event.notification.close();event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>list[0]?list[0].focus():clients.openWindow("./")));});
