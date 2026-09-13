import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const T = {
  fr: { sources:'SOURCES', overlays:'OVERLAYS', camera:'Caméra', api:'API CONNECTÉES', latency:'LATENCE', fps:'FPS', search:'Rechercher une carte Yu-Gi-Oh!', send:'Afficher sur le stream', hide:'Masquer', copy:'Copier le lien OBS', copied:'Lien copié', settings:'Réglages', update:'Mise à jour', current:'Version actuelle', latest:'Dernière version', noUpdate:'À jour', available:'Mise à jour disponible', refresh:'Actualiser', camOff:'Caméra désactivée', chooseCam:'Choisir la caméra', overlayUrl:'URL OVERLAY OBS', detection:'Détection caméra', beta:'Bêta : reconnaissance visuelle à venir', onePiece:'API One Piece', save:'Enregistrer' },
  en: { sources:'SOURCES', overlays:'OVERLAYS', camera:'Camera', api:'APIS CONNECTED', latency:'LATENCY', fps:'FPS', search:'Search a Yu-Gi-Oh! card', send:'Show on stream', hide:'Hide', copy:'Copy OBS link', copied:'Link copied', settings:'Settings', update:'Update', current:'Current version', latest:'Latest version', noUpdate:'Up to date', available:'Update available', refresh:'Refresh', camOff:'Camera disabled', chooseCam:'Choose camera', overlayUrl:'OBS OVERLAY URL', detection:'Camera detection', beta:'Beta: visual recognition coming next', onePiece:'One Piece API', save:'Save' },
  es: { sources:'FUENTES', overlays:'OVERLAYS', camera:'Cámara', api:'APIS CONECTADAS', latency:'LATENCIA', fps:'FPS', search:'Buscar una carta Yu-Gi-Oh!', send:'Mostrar en stream', hide:'Ocultar', copy:'Copiar enlace OBS', copied:'Enlace copiado', settings:'Ajustes', update:'Actualización', current:'Versión actual', latest:'Última versión', noUpdate:'Actualizado', available:'Actualización disponible', refresh:'Actualizar', camOff:'Cámara desactivada', chooseCam:'Elegir cámara', overlayUrl:'URL OVERLAY OBS', detection:'Detección de cámara', beta:'Beta: reconocimiento visual próximamente', onePiece:'API One Piece', save:'Guardar' },
  it: { sources:'SORGENTI', overlays:'OVERLAY', camera:'Fotocamera', api:'API CONNESSE', latency:'LATENZA', fps:'FPS', search:'Cerca una carta Yu-Gi-Oh!', send:'Mostra nello stream', hide:'Nascondi', copy:'Copia link OBS', copied:'Link copiato', settings:'Impostazioni', update:'Aggiornamento', current:'Versione attuale', latest:'Ultima versione', noUpdate:'Aggiornato', available:'Aggiornamento disponibile', refresh:'Aggiorna', camOff:'Fotocamera disattivata', chooseCam:'Scegli fotocamera', overlayUrl:'URL OVERLAY OBS', detection:'Rilevamento camera', beta:'Beta: riconoscimento visivo in arrivo', onePiece:'API One Piece', save:'Salva' }
};

function fmtCount(n){ if(n == null) return '—'; return new Intl.NumberFormat().format(n); }

export default function App(){
  const [lang,setLang] = useState(localStorage.getItem('tcg_lang') || 'fr');
  const tr = T[lang] || T.fr;
  const [apis,setApis] = useState([]);
  const [overlayUrl,setOverlayUrl] = useState('');
  const [cameraOn,setCameraOn] = useState(false);
  const [devices,setDevices] = useState([]);
  const [deviceId,setDeviceId] = useState('');
  const [camFps,setCamFps] = useState(0);
  const [card,setCard] = useState(null);
  const [query,setQuery] = useState('Dragon Blanc');
  const [searching,setSearching] = useState(false);
  const [toast,setToast] = useState('');
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [onePieceUrl,setOnePieceUrl] = useState(localStorage.getItem('onepiece_url') || '');
  const [onePieceKey,setOnePieceKey] = useState(localStorage.getItem('onepiece_key') || '');
  const [release,setRelease] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fpsRef = useRef({ count:0, start:performance.now() });

  const connectedCount = apis.filter(a=>a.connected).length;
  const avgLatency = useMemo(()=>{
    const a=apis.filter(x=>x.connected && x.latency_ms>0); return a.length?Math.round(a.reduce((s,x)=>s+x.latency_ms,0)/a.length):0;
  },[apis]);

  useEffect(()=>{
    (async()=>{
      try{
        if(!localStorage.getItem('tcg_lang')){
          const installed = await invoke('get_install_language');
          if(T[installed]){ setLang(installed); localStorage.setItem('tcg_lang', installed); }
        }
        const info = await invoke('overlay_info'); setOverlayUrl(info.url);
      }catch(e){ console.error(e); }
    })();
    refreshApis(); checkRelease();
    const id=setInterval(refreshApis,30000);
    return ()=>clearInterval(id);
  },[]);

  useEffect(()=>{ localStorage.setItem('tcg_lang',lang); },[lang]);

  async function refreshApis(){
    const url=localStorage.getItem('onepiece_url')||'';
    const key=localStorage.getItem('onepiece_key')||'';
    const results = await Promise.all([
      invoke('api_status',{game:'ygo',apiUrl:null,apiKey:null}).catch(e=>({id:'ygo',name:'YGOPRODeck',connected:false,detail:String(e)})),
      invoke('api_status',{game:'pokemon',apiUrl:null,apiKey:null}).catch(e=>({id:'pokemon',name:'Pokémon TCG',connected:false,detail:String(e)})),
      invoke('api_status',{game:'onepiece',apiUrl:url||null,apiKey:key||null}).catch(e=>({id:'onepiece',name:'One Piece',connected:false,detail:String(e)}))
    ]);
    setApis(results);
  }

  async function checkRelease(){ try{ setRelease(await invoke('check_latest_release')); }catch(e){ console.warn(e); } }

  async function startCamera(id=deviceId){
    try{
      if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
      const constraints={video:{deviceId:id?{exact:id}:undefined,width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:60}},audio:false};
      const stream=await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current=stream; setCameraOn(true);
      if(videoRef.current){ videoRef.current.srcObject=stream; await videoRef.current.play(); }
      const list=await navigator.mediaDevices.enumerateDevices();
      const cams=list.filter(d=>d.kind==='videoinput'); setDevices(cams);
      if(!id && cams[0]) setDeviceId(cams[0].deviceId);
      measureVideoFps();
    }catch(e){ setToast(String(e)); setCameraOn(false); }
  }

  function stopCamera(){ if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; setCameraOn(false); setCamFps(0); }

  function measureVideoFps(){
    const v=videoRef.current; if(!v) return;
    fpsRef.current={count:0,start:performance.now()};
    const cb=()=>{
      if(!streamRef.current) return;
      fpsRef.current.count++;
      const now=performance.now(); const elapsed=now-fpsRef.current.start;
      if(elapsed>=1000){ setCamFps(Math.round(fpsRef.current.count*1000/elapsed)); fpsRef.current={count:0,start:now}; }
      if(v.requestVideoFrameCallback) v.requestVideoFrameCallback(cb); else requestAnimationFrame(cb);
    };
    if(v.requestVideoFrameCallback) v.requestVideoFrameCallback(cb); else requestAnimationFrame(cb);
  }

  async function searchCard(e){
    e?.preventDefault(); setSearching(true);
    try{
      const apiLang=['fr','it'].includes(lang)?lang:null;
      const r=await invoke('search_ygo_card',{query,language:apiLang}); setCard(r);
    }catch(e){ setToast(String(e)); } finally{ setSearching(false); }
  }

  async function showOnOverlay(){
    if(!card) return;
    await invoke('set_overlay_card',{card:{visible:true,name:card.name,subtitle:[card.card_type,card.attribute,card.race].filter(Boolean).join(' • '),image_url:card.image_url,atk:card.atk,def:card.def,badge:'YU-GI-OH!'}});
    setToast('Overlay mis à jour');
  }
  async function hideOverlay(){ await invoke('set_overlay_card',{card:{visible:false,name:'',subtitle:'',image_url:'',atk:null,def:null,badge:'TCG'}}); }

  async function copyOverlay(){ await navigator.clipboard.writeText(overlayUrl); setToast(tr.copied); }

  function saveSettings(){
    localStorage.setItem('onepiece_url',onePieceUrl); localStorage.setItem('onepiece_key',onePieceKey);
    setSettingsOpen(false); refreshApis();
  }

  useEffect(()=>{ if(!toast) return; const id=setTimeout(()=>setToast(''),2500); return()=>clearTimeout(id); },[toast]);

  return <div className="app">
    <header className="topbar">
      <div className="brand"><div className="logo">TCG</div><div><b>STREAM TOOL</b><span>THEMED EDITION • v1.0.9</span></div></div>
      <div className="user"><strong>Quentin</strong><span>● LIVE READY</span></div>
      <div className="top-actions">
        <select value={lang} onChange={e=>setLang(e.target.value)}><option value="fr">FR</option><option value="en">EN</option><option value="es">ES</option><option value="it">IT</option></select>
        <button className="mode">◆ YGO</button>
        <button className="iconbtn" onClick={()=>setSettingsOpen(true)}>⚙</button>
      </div>
    </header>

    <main className="layout">
      <section className="leftcol">
        <div className="panel">
          <div className="panel-title"><span>▱ {tr.overlays}</span><span className="chip">YGO</span></div>
          {['Cam Frame','Card Pop','Chat Box'].map((x,i)=><div className="toggle-row" key={x}><div><b>{x}</b><small>{i===0?'Cadre caméra':i===1?'Carte détectée':'Zone chat'}</small></div><span className="switch on"></span></div>)}
          <div className="toggle-row disabled"><div><b>Alert Box</b><small>Follow / Sub</small></div><span className="switch"></span></div>
        </div>

        <div className="panel">
          <div className="panel-title">▰ {tr.sources}</div>
          {apis.map(a=><div className="source-row" key={a.id}><span><i className={a.connected?'dot ok':'dot'}></i>{a.name}</span><b>{a.connected?fmtCount(a.count):'OFF'}</b></div>)}
          <div className="source-row sep"><span>{tr.latency}</span><b>~{avgLatency || '—'} ms</b></div>
          <button className="ghost full" onClick={refreshApis}>{tr.refresh}</button>
        </div>
      </section>

      <section className="centercol">
        <div className="camera-panel">
          <div className="live-badge"><i></i> LIVE</div>
          <video ref={videoRef} className={cameraOn?'camera-video':'camera-video hidden'} playsInline muted />
          {!cameraOn && <div className="camera-empty"><div className="cam-icon">◉</div><h3>{tr.camOff}</h3><button className="primary" onClick={()=>startCamera()}>Activer la caméra</button></div>}
          <div className="camera-bottom"><span>● {cameraOn?`LIVE • ${camFps || '—'} FPS`:'OFFLINE'}</span><div className="cam-actions">
            {cameraOn && <select value={deviceId} onChange={e=>{setDeviceId(e.target.value);startCamera(e.target.value)}}>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||tr.chooseCam}</option>)}</select>}
            {cameraOn && <button className="ghost" onClick={stopCamera}>Stop</button>}
          </div></div>
        </div>

        <form className="searchbar" onSubmit={searchCard}>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr.search}/>
          <button className="primary" disabled={searching}>{searching?'…':'Rechercher'}</button>
        </form>

        <div className="card-panel">
          {card ? <>
            <div className="card-art">{card.image_url?<img src={card.image_url} alt=""/>:<span>CARTE</span>}</div>
            <div className="card-info"><div className="goldline">♛ YU-GI-OH! • LIVE API</div><h1>{card.name}</h1><div className="stats"><span>ATK {card.atk ?? '—'}</span><span>DEF {card.def ?? '—'}</span></div><p>{card.description?.slice(0,240)}{card.description?.length>240?'…':''}</p><small>{card.card_type} • {card.attribute} • {card.race}</small><div className="actions"><button className="primary" onClick={showOnOverlay} type="button">{tr.send}</button><button className="ghost" onClick={hideOverlay} type="button">{tr.hide}</button></div></div>
          </> : <div className="empty-card">Recherchez une carte pour l’afficher ici et sur votre overlay OBS.</div>}
        </div>
      </section>

      <section className="rightcol">
        <div className="panel">
          <div className="panel-title">◉ STREAM STATS</div>
          <div className="statgrid"><div><strong>{avgLatency||'—'}<small>ms</small></strong><span>{tr.latency}</span></div><div><strong>{camFps||'—'}</strong><span>{tr.fps}</span></div></div>
          <div className="api-badge"><i className="dot ok"></i>{tr.api} • {connectedCount}/3</div>
        </div>
        <div className="panel overlay-box">
          <div className="panel-title">◎ {tr.overlayUrl}</div>
          <code>{overlayUrl || '...'}</code>
          <button className="primary full" onClick={copyOverlay}>{tr.copy}</button>
          <small>OBS → Source navigateur → 1920 × 1080. Le lien fonctionne uniquement pendant que TCG STREAM TOOL est ouvert.</small>
        </div>
        <div className="panel">
          <div className="panel-title">⌁ {tr.detection}</div>
          <div className="beta">{tr.beta}</div>
          <small>La caméra, les API et l’overlay sont fonctionnels. La reconnaissance visuelle automatique des cartes nécessite encore le module de vision.</small>
        </div>
        <div className="panel">
          <div className="panel-title">↻ {tr.update}</div>
          {release ? <div className="update-box"><span>{tr.current}: <b>{release.current}</b></span><span>{tr.latest}: <b>{release.latest||'—'}</b></span><strong className={release.update_available?'warn':'oktxt'}>{release.update_available?tr.available:tr.noUpdate}</strong><button className="ghost full" onClick={checkRelease}>{tr.refresh}</button></div> : <small>Vérification GitHub…</small>}
        </div>
      </section>
    </main>

    {settingsOpen && <div className="modalback" onMouseDown={()=>setSettingsOpen(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><h2>{tr.settings}</h2><label>{tr.onePiece} URL<input value={onePieceUrl} onChange={e=>setOnePieceUrl(e.target.value)} placeholder="https://..."/></label><label>API key<input type="password" value={onePieceKey} onChange={e=>setOnePieceKey(e.target.value)} placeholder="X-API-Key"/></label><p>YGOPRODeck et Pokémon TCG fonctionnent sans clé. Pour One Piece, indiquez l’endpoint de votre fournisseur API et sa clé si nécessaire.</p><div className="actions"><button className="primary" onClick={saveSettings}>{tr.save}</button><button className="ghost" onClick={()=>setSettingsOpen(false)}>Fermer</button></div></div></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>
}
