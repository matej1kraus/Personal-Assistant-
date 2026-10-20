/* GHStore – data v souboru data.json v soukromém GitHub repozitáři.
   Lokální kopie v localStorage → aplikace funguje i offline a hned po otevření. */
(function(){
  const LS_CFG='asistent.cfg', LS_DATA='asistent.data';
  const ls = { get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(_){ return null; } },
               set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} } };
  let cfg = ls.get(LS_CFG) || null;            // {owner, repo, path, token}
  let data = ls.get(LS_DATA) || { version:1, collections:{ items:{}, finance:{} }, dirty:false };
  let sha = data.sha || null, pending = false, status = 'local', lastError = '';
  const listeners = {};                        // name -> [cb]
  const statusCbs = [];

  const b64e = s => { const b=new TextEncoder().encode(s); let out=''; for(let i=0;i<b.length;i+=0x8000) out+=String.fromCharCode.apply(null, b.subarray(i,i+0x8000)); return btoa(out); };
  const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g,'')), c => c.charCodeAt(0)));
  const api = (path, opts={}) => fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
      ...opts, headers:{ 'Authorization':`Bearer ${cfg.token}`, 'Accept':'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', ...(opts.headers||{}) }, cache:'no-store' });

  function persist(){ data.sha = sha; ls.set(LS_DATA, data); }
  function setStatus(s, err){ status = s; lastError = err||''; statusCbs.forEach(cb=>cb(text())); }
  function text(){
    if(!cfg) return 'Nepřipojeno ke GitHubu – data jen v tomto zařízení';
    return { local:'Nepřipojeno', syncing:'Synchronizuji…', saved:'Uloženo na GitHubu', offline:'Offline – uložím, až bude připojení', error:'Chyba: '+lastError }[status] || '';
  }
  function emit(name){
    const docs = Object.entries(data.collections[name]||{}).filter(([,v])=>!v._deleted)
      .map(([id,v]) => ({ id, exists:true, data:()=>{ const {_u,_deleted,...rest}=v; return rest; } }));
    const snap = { docs, size:docs.length, empty:!docs.length, metadata:{ hasPendingWrites:pending, fromCache:false } };
    (listeners[name]||[]).forEach(cb=>cb(snap));
  }
  const emitAll = () => Object.keys(listeners).forEach(emit);

  // sloučení: novější úprava dokumentu vyhrává (pole _u = čas úpravy)
  function merge(remote){
    for(const [name, docs] of Object.entries(remote.collections||{})){
      const local = data.collections[name] = data.collections[name]||{};
      for(const [id, r] of Object.entries(docs)){
        const l = local[id];
        if(!l || (r._u||0) > (l._u||0)) local[id] = r;
      }
    }
  }
  async function pull(){
    if(!cfg) return;
    const res = await api(cfg.path);
    if(res.status===404){ sha=null; return; }
    if(!res.ok) throw new Error(res.status===401?'neplatný token':res.status===403?'token nemá oprávnění k repozitáři':'GitHub '+res.status);
    const j = await res.json(); sha = j.sha;
    merge(JSON.parse(b64d(j.content)));
  }
  async function push(){
    const body = { version:1, collections:data.collections };
    const res = await api(cfg.path, { method:'PUT', body:JSON.stringify({
      message:'Asistent: aktualizace dat', content:b64e(JSON.stringify(body,null,1)), ...(sha?{sha}:{}) }) });
    if(res.status===409 || res.status===422){ await pull(); return push(); }   // někdo uložil mezitím → sloučit a znovu
    if(!res.ok) throw new Error('uložení selhalo ('+res.status+')');
    sha = (await res.json()).content.sha;
  }
  let timer=null, running=false;
  function schedule(){ pending=true; data.dirty=true; persist(); emitAll(); clearTimeout(timer); timer=setTimeout(sync, 800); }
  async function sync(){
    if(!cfg){ pending=false; emitAll(); setStatus('local'); return; }
    if(running){ clearTimeout(timer); timer=setTimeout(sync, 1000); return; }
    running=true; setStatus('syncing');
    try{
      await pull();
      if(data.dirty || !sha){ await push(); data.dirty=false; }
      pending=false; persist(); emitAll(); setStatus('saved');
    }catch(e){ setStatus(navigator.onLine===false?'offline':'error', e.message); }
    finally{ running=false; }
  }

  function collection(name){
    data.collections[name] = data.collections[name]||{};
    const ref = id => ({
      id,
      async set(v){ data.collections[name][id] = {...v, _u:Date.now()}; schedule(); },
      async update(v){ const cur = data.collections[name][id]; if(!cur || cur._deleted) throw {code:'invalid_argument'}; data.collections[name][id] = {...cur, ...v, _u:Date.now()}; schedule(); },
      async delete(){ data.collections[name][id] = {_deleted:true, _u:Date.now()}; schedule(); },
    });
    return {
      doc:(id)=>ref(id || ('d'+Date.now().toString(36)+Math.random().toString(36).slice(2,8))),
      async add(v){ const r = ref('d'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)); await r.set(v); return r; },
      onSnapshot(cb){ (listeners[name] = listeners[name]||[]).push(cb); setTimeout(()=>emit(name)); return ()=>{ listeners[name]=listeners[name].filter(x=>x!==cb); }; },
    };
  }

  window.GHStore = {
    db:{ collection },
    config:()=>cfg ? {owner:cfg.owner, repo:cfg.repo, path:cfg.path, hasToken:!!cfg.token} : null,
    async connect(c){ cfg = {path:'data.json', ...c}; ls.set(LS_CFG, cfg); sha=null; data.dirty=true; await sync(); return status==='saved' ? null : lastError || 'Připojení selhalo'; },
    disconnect(){ cfg=null; try{ localStorage.removeItem(LS_CFG); }catch(_){} setStatus('local'); },
    importJSON(obj){ merge(obj); data.dirty=true; schedule(); },
    exportJSON(){ return { version:1, collections:data.collections }; },
    onStatus(cb){ statusCbs.push(cb); cb(text()); },
    sync,
  };
  // pravidelné načtení změn z druhého zařízení
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') sync(); });
  window.addEventListener('online', sync);
  setInterval(()=>{ if(document.visibilityState==='visible') sync(); }, 60000);
  sync();
})();
