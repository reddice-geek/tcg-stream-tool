import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createWorker } from 'tesseract.js';

const T = {
  fr: { sources:'SOURCES', overlays:'OVERLAYS', camera:'Caméra', api:'API CONNECTÉES', latency:'LATENCE', fps:'FPS', search:'Rechercher une carte Yu-Gi-Oh!', send:'Afficher sur le stream', hide:'Masquer', copy:'Copier le lien OBS', copied:'Lien copié', settings:'Réglages', update:'Mise à jour', current:'Version actuelle', latest:'Dernière version', noUpdate:'À jour', available:'Mise à jour disponible', refresh:'Actualiser', camOff:'Caméra désactivée', chooseCam:'Choisir la caméra', overlayUrl:'URL OVERLAY OBS', detection:'Reconnaissance visuelle', detectionOff:'Détection arrêtée', detectionOn:'Détection automatique active', detecting:'Analyse de la carte…', detected:'Carte détectée', startDetection:'Activer la détection', stopDetection:'Arrêter la détection', scanNow:'Scanner maintenant', detectionHelp:'Place la carte droite face à la caméra, assez proche, avec le nom bien visible.', onePiece:'API One Piece', save:'Enregistrer', autoOverlay:'Afficher automatiquement la carte détectée dans OBS' },
  en: { sources:'SOURCES', overlays:'OVERLAYS', camera:'Camera', api:'APIS CONNECTED', latency:'LATENCY', fps:'FPS', search:'Search a Yu-Gi-Oh! card', send:'Show on stream', hide:'Hide', copy:'Copy OBS link', copied:'Link copied', settings:'Settings', update:'Update', current:'Current version', latest:'Latest version', noUpdate:'Up to date', available:'Update available', refresh:'Refresh', camOff:'Camera disabled', chooseCam:'Choose camera', overlayUrl:'OBS OVERLAY URL', detection:'Visual recognition', detectionOff:'Detection stopped', detectionOn:'Automatic detection active', detecting:'Analyzing card…', detected:'Card detected', startDetection:'Enable detection', stopDetection:'Stop detection', scanNow:'Scan now', detectionHelp:'Hold the card straight and close enough to the camera with its name clearly visible.', onePiece:'One Piece API', save:'Save', autoOverlay:'Automatically show detected card in OBS' },
  es: { sources:'FUENTES', overlays:'OVERLAYS', camera:'Cámara', api:'APIS CONECTADAS', latency:'LATENCIA', fps:'FPS', search:'Buscar una carta Yu-Gi-Oh!', send:'Mostrar en stream', hide:'Ocultar', copy:'Copiar enlace OBS', copied:'Enlace copiado', settings:'Ajustes', update:'Actualización', current:'Versión actual', latest:'Última versión', noUpdate:'Actualizado', available:'Actualización disponible', refresh:'Actualizar', camOff:'Cámara desactivada', chooseCam:'Elegir cámara', overlayUrl:'URL OVERLAY OBS', detection:'Reconocimiento visual', detectionOff:'Detección detenida', detectionOn:'Detección automática activa', detecting:'Analizando carta…', detected:'Carta detectada', startDetection:'Activar detección', stopDetection:'Detener detección', scanNow:'Escanear ahora', detectionHelp:'Coloca la carta recta y cerca de la cámara, con el nombre claramente visible.', onePiece:'API One Piece', save:'Guardar', autoOverlay:'Mostrar automáticamente la carta detectada en OBS' },
  it: { sources:'SORGENTI', overlays:'OVERLAY', camera:'Fotocamera', api:'API CONNESSE', latency:'LATENZA', fps:'FPS', search:'Cerca una carta Yu-Gi-Oh!', send:'Mostra nello stream', hide:'Nascondi', copy:'Copia link OBS', copied:'Link copiato', settings:'Impostazioni', update:'Aggiornamento', current:'Versione attuale', latest:'Ultima versione', noUpdate:'Aggiornato', available:'Aggiornamento disponibile', refresh:'Aggiorna', camOff:'Fotocamera disattivata', chooseCam:'Scegli fotocamera', overlayUrl:'URL OVERLAY OBS', detection:'Riconoscimento visivo', detectionOff:'Rilevamento fermo', detectionOn:'Rilevamento automatico attivo', detecting:'Analisi della carta…', detected:'Carta rilevata', startDetection:'Attiva rilevamento', stopDetection:'Ferma rilevamento', scanNow:'Scansiona ora', detectionHelp:'Tieni la carta dritta e abbastanza vicina alla fotocamera, con il nome ben visibile.', onePiece:'API One Piece', save:'Salva', autoOverlay:'Mostra automaticamente la carta rilevata in OBS' }
};

function fmtCount(n){ if(n == null) return '—'; return new Intl.NumberFormat().format(n); }
function cleanOcrText(text){
  return String(text || '')
    .replace(/[|\\_~`^]/g,' ')
    .replace(/[^A-Za-zÀ-ÿ0-9'’\- :]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function normalizeCardText(text){
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function levenshtein(a,b){
  a = normalizeCardText(a);
  b = normalizeCardText(b);
  const m = Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let prev=m[0];
    m[0]=i;
    for(let j=1;j<=b.length;j++){
      const temp=m[j];
      m[j]=Math.min(
        m[j]+1,
        m[j-1]+1,
        prev + (a[i-1]===b[j-1] ? 0 : 1)
      );
      prev=temp;
    }
  }
  return m[b.length];
}

function similarity(a,b){
  const na=normalizeCardText(a);
  const nb=normalizeCardText(b);
  if(!na || !nb) return 0;
  const max=Math.max(na.length,nb.length);
  return max ? 1-(levenshtein(na,nb)/max) : 0;
}

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
  const [profile,setProfile] = useState(()=>{
    try{
      return JSON.parse(localStorage.getItem('tcg_profile')) || {
        streamer:'',
        channel:'',
        platform:'twitch',
        resolution:'1080p',
        fps:60,
        mode:'live',
        tcgs:['ygo']
      };
    }catch{
      return {streamer:'',channel:'',platform:'twitch',resolution:'1080p',fps:60,mode:'live',tcgs:['ygo']};
    }
  });
  const [wizardOpen,setWizardOpen] = useState(!localStorage.getItem('tcg_profile'));
  const [wizardStep,setWizardStep] = useState(1);
  const [onePieceUrl,setOnePieceUrl] = useState(localStorage.getItem('onepiece_url') || '');
  const [onePieceKey,setOnePieceKey] = useState(localStorage.getItem('onepiece_key') || '');
  const [release,setRelease] = useState(null);
  const [detectionOn,setDetectionOn] = useState(false);
  const [detecting,setDetecting] = useState(false);
  const [lastOcr,setLastOcr] = useState('');
  const [lastDetected,setLastDetected] = useState('');
  const [autoOverlay,setAutoOverlay] = useState(localStorage.getItem('auto_overlay') === '1');
  const [booting,setBooting] = useState(true);
  const [bootProgress,setBootProgress] = useState(0);
  const [bootStatus,setBootStatus] = useState('Initialisation…');
  const [bootChecks,setBootChecks] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fpsRef = useRef({ count:0, start:performance.now() });
  const workerRef = useRef(null);
  const detectionTimerRef = useRef(null);
  const detectingRef = useRef(false);
  const lastDetectedRef = useRef('');

  const connectedCount = apis.filter(a=>a.connected).length;
  const avgLatency = useMemo(()=>{
    const a=apis.filter(x=>x.connected && x.latency_ms>0); return a.length?Math.round(a.reduce((s,x)=>s+x.latency_ms,0)/a.length):0;
  },[apis]);

  useEffect(()=>{
    let mounted = true;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const addBootCheck = (label, ok, detail='') => {
      if(!mounted) return;
      setBootChecks(prev => [...prev, { label, ok, detail }]);
    };

    (async()=>{
      const started = performance.now();
      try{
        setBootStatus('Chargement des préférences…');
        setBootProgress(8);
        if(!localStorage.getItem('tcg_lang')){
          try{
            const installed = await invoke('get_install_language');
            if(T[installed]){ setLang(installed); localStorage.setItem('tcg_lang', installed); }
            addBootCheck('Préférences et langue', true);
          }catch(e){ addBootCheck('Préférences et langue', false, String(e)); }
        }else{
          addBootCheck('Préférences et langue', true);
        }

        setBootStatus('Démarrage de l’overlay OBS…');
        setBootProgress(22);
        try{
          const info = await invoke('overlay_info');
          if(mounted) setOverlayUrl(info.url);
          addBootCheck('Serveur overlay OBS', true, info?.url || 'Prêt');
        }catch(e){
          addBootCheck('Serveur overlay OBS', false, String(e));
        }

        setBootStatus('Vérification de la base Yu-Gi-Oh!…');
        setBootProgress(38);
        const ygo = await invoke('api_status',{game:'ygo',apiUrl:null,apiKey:null})
          .catch(e=>({id:'ygo',name:'YGOPRODeck',connected:false,detail:String(e)}));
        addBootCheck('Base Yu-Gi-Oh! / YGOPRODeck', !!ygo.connected, ygo.detail || (ygo.count != null ? `${ygo.count} cartes` : ''));

        setBootStatus('Vérification de la base Pokémon TCG…');
        setBootProgress(55);
        const pokemon = await invoke('api_status',{game:'pokemon',apiUrl:null,apiKey:null})
          .catch(e=>({id:'pokemon',name:'Pokémon TCG',connected:false,detail:String(e)}));
        addBootCheck('Base Pokémon TCG', !!pokemon.connected, pokemon.detail || (pokemon.count != null ? `${pokemon.count} cartes` : ''));

        setBootStatus('Vérification de l’API One Piece…');
        setBootProgress(70);
        const opUrl=localStorage.getItem('onepiece_url')||'';
        const opKey=localStorage.getItem('onepiece_key')||'';
        const onepiece = await invoke('api_status',{game:'onepiece',apiUrl:opUrl||null,apiKey:opKey||null})
          .catch(e=>({id:'onepiece',name:'One Piece',connected:false,detail:String(e)}));
        addBootCheck('API One Piece', !!onepiece.connected, onepiece.detail || (onepiece.count != null ? `${onepiece.count} cartes` : 'Non configurée'));

        if(mounted) setApis([ygo,pokemon,onepiece]);

        setBootStatus('Vérification des mises à jour…');
        setBootProgress(85);
        try{
          const r = await invoke('check_latest_release');
          if(mounted) setRelease(r);
          addBootCheck('Service de mise à jour', true, r?.latest ? `Dernière version ${r.latest}` : 'Prêt');
        }catch(e){
          addBootCheck('Service de mise à jour', false, String(e));
        }

        setBootStatus('TCG STREAM TOOL est prêt');
        setBootProgress(100);
        const elapsed = performance.now() - started;
        if(elapsed < 2400) await wait(2400 - elapsed);
        await wait(500);
      }catch(e){
        console.error('Boot:',e);
        setBootStatus('Démarrage en mode dégradé…');
        await wait(900);
      }finally{
        if(mounted) setBooting(false);
      }
    })();

    const id=setInterval(refreshApis,30000);
    return ()=>{
      mounted = false;
      clearInterval(id);
      clearInterval(detectionTimerRef.current);
      if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
      if(workerRef.current) workerRef.current.terminate().catch(()=>{});
    };
  },[]);

  useEffect(()=>{ localStorage.setItem('tcg_lang',lang); },[lang]);
  useEffect(()=>{ localStorage.setItem('auto_overlay',autoOverlay?'1':'0'); },[autoOverlay]);

  async function refreshApis(){
    const url=localStorage.getItem('onepiece_url')||'';
    const key=localStorage.getItem('onepiece_key')||'';
    const defs=[
      ['ygo','YGOPRODeck',null,null],
      ['pokemon','Pokémon TCG',null,null],
      ['onepiece','One Piece',url||null,key||null],
      ['magic','Magic / Scryfall',null,null],
      ['vanguard','Cardfight!! Vanguard',null,null]
    ];

    const results = await Promise.all(
      defs.map(([game,name,apiUrl,apiKey]) =>
        invoke('api_status',{game,apiUrl,apiKey})
          .catch(e=>({id:game,name,connected:false,count:null,latency_ms:0,detail:String(e)}))
      )
    );
    setApis(results);
    return results;
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
      const activeId=stream.getVideoTracks()[0]?.getSettings()?.deviceId;
      if(activeId) setDeviceId(activeId); else if(!id && cams[0]) setDeviceId(cams[0].deviceId);
      measureVideoFps();
    }catch(e){ setToast(String(e)); setCameraOn(false); }
  }

  function stopCamera(){
    stopDetection();
    if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    streamRef.current=null; setCameraOn(false); setCamFps(0);
  }

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

  async function searchCard(e, forcedQuery=null){
    e?.preventDefault();
    const value=(forcedQuery ?? query).trim();
    if(!value) return null;
    setSearching(true);
    try{
      const apiLang=['fr','it'].includes(lang)?lang:null;
      const r=await invoke('search_ygo_card',{query:value,language:apiLang});
      setCard(r);
      return r;
    }catch(e){
      if(!forcedQuery) setToast(String(e));
      return null;
    } finally{ setSearching(false); }
  }

  async function showCardOnOverlay(target=card){
    if(!target) return;
    await invoke('set_overlay_card',{card:{visible:true,name:target.name,subtitle:[target.card_type,target.attribute,target.race].filter(Boolean).join(' • '),image_url:target.image_url,atk:target.atk,def:target.def,badge:'YU-GI-OH!'}});
  }

  async function showOnOverlay(){ if(!card) return; await showCardOnOverlay(card); setToast('Overlay mis à jour'); }
  async function hideOverlay(){ await invoke('set_overlay_card',{card:{visible:false,name:'',subtitle:'',image_url:'',atk:null,def:null,badge:'TCG'}}); }
  async function copyOverlay(){ await navigator.clipboard.writeText(overlayUrl); setToast(tr.copied); }

  async function getVisionWorker(){
    if(workerRef.current) return workerRef.current;
    setToast('Chargement du module de vision…');
    workerRef.current = await createWorker('eng', 1, {
      logger: m => {
        if(m.status === 'recognizing text') setDetecting(true);
      }
    });
    return workerRef.current;
  }

  function captureNameStrip(){
    const video=videoRef.current;
    if(!video || !video.videoWidth || !video.videoHeight) throw new Error('La caméra n’est pas prête');
    const sourceW=video.videoWidth, sourceH=video.videoHeight;
    const cardW=Math.floor(sourceW*0.62);
    const cardH=Math.floor(Math.min(sourceH*0.88, cardW*1.45));
    const x=Math.floor((sourceW-cardW)/2);
    const y=Math.floor((sourceH-cardH)/2);
    const nameH=Math.max(80,Math.floor(cardH*0.18));
    const canvas=document.createElement('canvas');
    canvas.width=1200;
    canvas.height=Math.max(180,Math.round(nameH*(1200/cardW)));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,x,y,cardW,nameH,0,0,canvas.width,canvas.height);
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const d=img.data;
    for(let i=0;i<d.length;i+=4){
      const g=Math.round(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114);
      const boosted=g<125?Math.max(0,g-28):Math.min(255,g+38);
      d[i]=d[i+1]=d[i+2]=boosted;
    }
    ctx.putImageData(img,0,0);
    return canvas;
  }

  async function scanCameraCard(){
    if(!cameraOn || detectingRef.current) return;

    detectingRef.current = true;
    setDetecting(true);

    try{
      const worker = await getVisionWorker();
      const canvas = captureNameStrip();
      const result = await worker.recognize(canvas);

      const confidence = Number(result?.data?.confidence || 0);
      const raw = cleanOcrText(result?.data?.text);
      setLastOcr(raw ? `${raw} • ${Math.round(confidence)}%` : '—');

      if(!raw || raw.length < 4 || confidence < 42){
        setLastDetected('');
        return;
      }

      const lines = String(result?.data?.text || '')
        .split(/\r?\n/)
        .map(cleanOcrText)
        .filter(x => x.length >= 4 && /[A-Za-zÀ-ÿ]/.test(x));

      const attempts=[];
      for(const line of lines){
        if(!attempts.includes(line)) attempts.push(line);
      }
      if(!attempts.includes(raw)) attempts.push(raw);

      let best=null;
      let bestScore=0;

      for(const candidate of attempts.slice(0,4)){
        const found = await searchCard(null,candidate);
        if(!found) continue;

        const score = similarity(candidate,found.name);
        if(score > bestScore){
          bestScore=score;
          best=found;
        }
      }

      if(!best || bestScore < 0.58){
        setLastDetected('');
        return;
      }

      setCard(best);
      setQuery(best.name);
      setLastDetected(`${best.name} • ${Math.round(bestScore*100)}%`);

      if(lastDetectedRef.current !== best.name){
        lastDetectedRef.current = best.name;
        setToast(`${tr.detected} : ${best.name}`);

        if(autoOverlay){
          await showCardOnOverlay(best);
        }
      }
    }catch(e){
      console.warn('Vision:',e);
      setLastOcr('Erreur OCR');
      setLastDetected('');
    }finally{
      detectingRef.current=false;
      setDetecting(false);
    }
  }

  async function startDetection(){
    if(!cameraOn){ await startCamera(); }
    setDetectionOn(true);
    clearInterval(detectionTimerRef.current);
    setTimeout(scanCameraCard,1200);
    detectionTimerRef.current=setInterval(scanCameraCard,4500);
  }

  function stopDetection(){
    setDetectionOn(false);
    clearInterval(detectionTimerRef.current);
    detectionTimerRef.current=null;
  }

  function persistProfile(next=profile){
    localStorage.setItem('tcg_profile',JSON.stringify(next));
    setProfile(next);
  }

  function toggleProfileTcg(id){
    const has=profile.tcgs.includes(id);
    const next={...profile,tcgs:has?profile.tcgs.filter(x=>x!==id):[...profile.tcgs,id]};
    setProfile(next);
  }

  function saveSettings(){
    localStorage.setItem('onepiece_url',onePieceUrl); localStorage.setItem('onepiece_key',onePieceKey);
    setSettingsOpen(false); refreshApis();
  }

  useEffect(()=>{ if(!toast) return; const id=setTimeout(()=>setToast(''),3000); return()=>clearTimeout(id); },[toast]);

  if(!booting && wizardOpen){
    const tcgOptions=[
      ['ygo','Yu-Gi-Oh!'],
      ['onepiece','One Piece'],
      ['pokemon','Pokémon'],
      ['magic','Magic'],
      ['vanguard','Vanguard']
    ];

    return (
      <div className="wizard-screen">
        <div className="wizard-shell">
          <div className="wizard-head">
            <b>TCG STREAM TOOL</b>
            <span>ÉTAPE {wizardStep} / 4</span>
          </div>
          <div className="wizard-progress"><i style={{width:`${wizardStep*25}%`}} /></div>

          {wizardStep===1 && (
            <div className="wizard-card">
              <span className="wizard-kicker">FIRST LAUNCH</span>
              <h1>Bienvenue dans <em>TCG STREAM TOOL</em></h1>
              <p>Configure ton identité de streamer.</p>
              <label>Nom de streamer<input value={profile.streamer} onChange={e=>setProfile({...profile,streamer:e.target.value})} placeholder="Ex: Kaiba_Duelist" /></label>
              <label>Nom de chaîne<input value={profile.channel} onChange={e=>setProfile({...profile,channel:e.target.value})} placeholder="ma-chaine-tcg" /></label>
              <label>Plateforme
                <select value={profile.platform} onChange={e=>setProfile({...profile,platform:e.target.value})}>
                  <option value="twitch">Twitch</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="other">Autre</option>
                </select>
              </label>
            </div>
          )}

          {wizardStep===2 && (
            <div className="wizard-card">
              <h1>Ton Setup Stream</h1>
              <p>Choisis la qualité souhaitée.</p>
              <div className="wizard-grid">
                {['720p','1080p','4K'].map(v=><button key={v} className={profile.resolution===v?'selected':''} onClick={()=>setProfile({...profile,resolution:v})}>{v}</button>)}
              </div>
              <div className="wizard-grid">
                {[30,60,120].map(v=><button key={v} className={profile.fps===v?'selected':''} onClick={()=>setProfile({...profile,fps:v})}>{v} FPS</button>)}
              </div>
              <div className="wizard-grid two">
                {['live','rec'].map(v=><button key={v} className={profile.mode===v?'selected':''} onClick={()=>setProfile({...profile,mode:v})}>{v.toUpperCase()}</button>)}
              </div>
            </div>
          )}

          {wizardStep===3 && (
            <div className="wizard-card">
              <h1>Tes TCG</h1>
              <p>Sélectionne les jeux que tu utilises.</p>
              <div className="wizard-tcgs">
                {tcgOptions.map(([id,name])=><button key={id} className={profile.tcgs.includes(id)?'selected':''} onClick={()=>toggleProfileTcg(id)}>{name}</button>)}
              </div>
            </div>
          )}

          {wizardStep===4 && (
            <div className="wizard-card">
              <h1>Connexion aux banques de données</h1>
              <p>Les sources sont vérifiées avant d'entrer dans l'application.</p>
              <div className="wizard-api-list">
                {apis.map(a=><div key={a.id}><span className={a.connected?'boot-ok':'boot-warn'}>{a.connected?'✓':'!'}</span><b>{a.name}</b><small>{a.connected ? (a.count!=null?`${fmtCount(a.count)} cartes`:'Connecté') : a.detail}</small></div>)}
              </div>
            </div>
          )}

          <div className="wizard-actions">
            {wizardStep>1 && <button className="ghost" onClick={()=>setWizardStep(x=>x-1)}>Retour</button>}
            <button className="primary" disabled={wizardStep===1 && (!profile.streamer.trim() || !profile.channel.trim())} onClick={()=>{
              if(wizardStep<4){setWizardStep(x=>x+1);}
              else{
                persistProfile(profile);
                setWizardOpen(false);
                setSettingsOpen(false);
              }
            }}>{wizardStep===4?'Entrer dans TCG STREAM TOOL':'Continuer'}</button>
          </div>
        </div>
      </div>
    );
  }

  if(booting){
    return <div className="boot-screen">
      <div className="boot-glow"></div>
      <div className="boot-card">
        <img className="boot-logo" src="/tcg-stream-tool-logo.png" alt="TCG STREAM TOOL" />
        <div className="boot-status">{bootStatus}</div>
        <div className="boot-progress"><div style={{width:`${bootProgress}%`}}></div></div>
        <div className="boot-percent">{bootProgress}%</div>
        <div className="boot-checks">
          {bootChecks.slice(-5).map((c,i)=><div className="boot-check" key={`${c.label}-${i}`}>
            <span className={c.ok?'boot-ok':'boot-warn'}>{c.ok?'✓':'!'}</span>
            <div><b>{c.label}</b>{c.detail && <small>{c.detail}</small>}</div>
          </div>)}
        </div>
        <small className="boot-note">Vérification des bases de cartes, des API, de l’overlay OBS et des mises à jour.</small>
      </div>
    </div>;
  }

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
          <div className={detectionOn?'vision-guide active':'vision-guide'}><span>ZONE CARTE</span></div>
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
          </> : <div className="empty-card">Recherchez ou scannez une carte pour l’afficher ici et sur votre overlay OBS.</div>}
        </div>
      </section>

      <section className="rightcol">
        <div className="panel">
          <div className="panel-title">◉ STREAM STATS</div>
          <div className="statgrid"><div><strong>{avgLatency||'—'}<small>ms</small></strong><span>{tr.latency}</span></div><div><strong>{camFps||'—'}</strong><span>{tr.fps}</span></div></div>
          <div className="api-badge"><i className="dot ok"></i>{tr.api} • {connectedCount}/{apis.length || 5}</div>
        </div>
        <div className="panel overlay-box">
          <div className="panel-title">◎ {tr.overlayUrl}</div>
          <code>{overlayUrl || '...'}</code>
          <button className="primary full" onClick={copyOverlay}>{tr.copy}</button>
          <small>OBS → Source navigateur → 1920 × 1080. Le lien fonctionne uniquement pendant que TCG STREAM TOOL est ouvert.</small>
        </div>
        <div className="panel vision-panel">
          <div className="panel-title">⌁ {tr.detection}</div>
          <div className={detectionOn?'vision-status on':'vision-status'}><i className={detectionOn?'dot ok':'dot'}></i>{detecting?tr.detecting:(detectionOn?tr.detectionOn:tr.detectionOff)}</div>
          <div className="vision-buttons">
            <button className={detectionOn?'ghost':'primary'} onClick={detectionOn?stopDetection:startDetection}>{detectionOn?tr.stopDetection:tr.startDetection}</button>
            <button className="ghost" disabled={!cameraOn || detecting} onClick={scanCameraCard}>{tr.scanNow}</button>
          </div>
          <label className="checkline"><input type="checkbox" checked={autoOverlay} onChange={e=>setAutoOverlay(e.target.checked)}/><span>{tr.autoOverlay}</span></label>
          <small>{tr.detectionHelp}</small>
          <div className="ocr-box"><span>OCR</span><b>{lastOcr || '—'}</b></div>
          {lastDetected && <div className="detected-box"><span>{tr.detected}</span><b>{lastDetected}</b></div>}
        </div>
        <div className="panel">
          <div className="panel-title">↻ {tr.update}</div>
          {release ? <div className="update-box"><span>{tr.current}: <b>{release.current}</b></span><span>{tr.latest}: <b>{release.latest||'—'}</b></span><strong className={release.update_available?'warn':'oktxt'}>{release.update_available?tr.available:tr.noUpdate}</strong><button className="ghost full" onClick={checkRelease}>{tr.refresh}</button></div> : <small>Vérification GitHub…</small>}
        </div>
      </section>
    </main>

    {settingsOpen && <div className="modalback" onMouseDown={()=>setSettingsOpen(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
      <h2>{tr.settings}</h2>
      <label>Nom de streamer<input value={profile.streamer} onChange={e=>setProfile({...profile,streamer:e.target.value})}/></label>
      <label>Nom de chaîne<input value={profile.channel} onChange={e=>setProfile({...profile,channel:e.target.value})}/></label>
      <label>Plateforme<select value={profile.platform} onChange={e=>setProfile({...profile,platform:e.target.value})}><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="other">Autre</option></select></label>
      <label>{tr.onePiece} URL<input value={onePieceUrl} onChange={e=>setOnePieceUrl(e.target.value)} placeholder="Laisser vide pour la source par défaut"/></label>
      <label>API key<input type="password" value={onePieceKey} onChange={e=>setOnePieceKey(e.target.value)} placeholder="Optionnel"/></label>
      <p>Les réglages du profil restent enregistrés localement. Tu peux aussi relancer l'assistant complet.</p>
      <div className="actions">
        <button className="primary" onClick={()=>{persistProfile(profile);saveSettings();}}>{tr.save}</button>
        <button className="ghost" onClick={()=>{setWizardStep(1);setWizardOpen(true);setSettingsOpen(false);}}>Assistant de profil</button>
        <button className="ghost" onClick={()=>setSettingsOpen(false)}>Fermer</button>
      </div>
    </div></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>
}
