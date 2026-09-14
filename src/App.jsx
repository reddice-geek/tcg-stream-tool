import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { check as checkForAppUpdate } from '@tauri-apps/plugin-updater';
import { createWorker } from 'tesseract.js';
import narutoSet1 from './data/naruto-mythos-set1.json';

const T = {
  fr: { sources:'SOURCES', overlays:'OVERLAYS', camera:'Caméra', api:'API CONNECTÉES', latency:'LATENCE', fps:'FPS', search:'Rechercher une carte Yu-Gi-Oh!', send:'Afficher sur le stream', hide:'Masquer', copy:'Copier le lien OBS', copied:'Lien copié', settings:'Réglages', update:'Mise à jour', current:'Version actuelle', latest:'Dernière version', noUpdate:'À jour', available:'Mise à jour disponible', refresh:'Actualiser', camOff:'Caméra désactivée', chooseCam:'Choisir la caméra', overlayUrl:'URL OVERLAY OBS', detection:'Reconnaissance visuelle', detectionOff:'Détection arrêtée', detectionOn:'Détection automatique active', detecting:'Analyse de la carte…', detected:'Carte détectée', startDetection:'Activer la détection', stopDetection:'Arrêter la détection', scanNow:'Scanner maintenant', detectionHelp:'Place la carte droite face à la caméra, assez proche, avec le nom bien visible.', onePiece:'API One Piece', save:'Enregistrer', autoOverlay:'Afficher automatiquement la carte détectée dans OBS' },
  en: { sources:'SOURCES', overlays:'OVERLAYS', camera:'Camera', api:'APIS CONNECTED', latency:'LATENCY', fps:'FPS', search:'Search a Yu-Gi-Oh! card', send:'Show on stream', hide:'Hide', copy:'Copy OBS link', copied:'Link copied', settings:'Settings', update:'Update', current:'Current version', latest:'Latest version', noUpdate:'Up to date', available:'Update available', refresh:'Refresh', camOff:'Camera disabled', chooseCam:'Choose camera', overlayUrl:'OBS OVERLAY URL', detection:'Visual recognition', detectionOff:'Detection stopped', detectionOn:'Automatic detection active', detecting:'Analyzing card…', detected:'Card detected', startDetection:'Enable detection', stopDetection:'Stop detection', scanNow:'Scan now', detectionHelp:'Hold the card straight and close enough to the camera with its name clearly visible.', onePiece:'One Piece API', save:'Save', autoOverlay:'Automatically show detected card in OBS' },
  es: { sources:'FUENTES', overlays:'OVERLAYS', camera:'Cámara', api:'APIS CONECTADAS', latency:'LATENCIA', fps:'FPS', search:'Buscar una carta Yu-Gi-Oh!', send:'Mostrar en stream', hide:'Ocultar', copy:'Copiar enlace OBS', copied:'Enlace copiado', settings:'Ajustes', update:'Actualización', current:'Versión actual', latest:'Última versión', noUpdate:'Actualizado', available:'Actualización disponible', refresh:'Actualizar', camOff:'Cámara desactivada', chooseCam:'Elegir cámara', overlayUrl:'URL OVERLAY OBS', detection:'Reconocimiento visual', detectionOff:'Detección detenida', detectionOn:'Detección automática activa', detecting:'Analizando carta…', detected:'Carta detectada', startDetection:'Activar detección', stopDetection:'Detener detección', scanNow:'Escanear ahora', detectionHelp:'Coloca la carta recta y cerca de la cámara, con el nombre claramente visible.', onePiece:'API One Piece', save:'Guardar', autoOverlay:'Mostrar automáticamente la carta detectada en OBS' },
  it: { sources:'SORGENTI', overlays:'OVERLAY', camera:'Fotocamera', api:'API CONNESSE', latency:'LATENZA', fps:'FPS', search:'Cerca una carta Yu-Gi-Oh!', send:'Mostra nello stream', hide:'Nascondi', copy:'Copia link OBS', copied:'Link copiato', settings:'Impostazioni', update:'Aggiornamento', current:'Versione attuale', latest:'Ultima versione', noUpdate:'Aggiornato', available:'Aggiornamento disponibile', refresh:'Aggiorna', camOff:'Fotocamera disattivata', chooseCam:'Scegli fotocamera', overlayUrl:'URL OVERLAY OBS', detection:'Riconoscimento visivo', detectionOff:'Rilevamento fermo', detectionOn:'Rilevamento automatico attivo', detecting:'Analisi della carta…', detected:'Carta rilevata', startDetection:'Attiva rilevamento', stopDetection:'Ferma rilevamento', scanNow:'Scansiona ora', detectionHelp:'Tieni la carta dritta e abbastanza vicina alla fotocamera, con il nome ben visibile.', onePiece:'API One Piece', save:'Salva', autoOverlay:'Mostra automaticamente la carta rilevata in OBS' }
};



const TCG_OPTIONS = [
  ['ygo','Yu-Gi-Oh!'],
  ['pokemon','Pokémon'],
  ['onepiece','One Piece'],
  ['vanguard','Cardfight!! Vanguard'],
  ['naruto','Naruto Mythos'],
  ['magic','Magic: The Gathering'],
  ['lorcana','Disney Lorcana'],
  ['digimon','Digimon'],
  ['dragonball','Dragon Ball Super'],
  ['unionarena','Union Arena'],
  ['weiss','Weiss Schwarz'],
  ['fleshblood','Flesh and Blood']
];

const TCG_LABEL = Object.fromEntries(TCG_OPTIONS);

const LOCAL_SOURCE_INFO = {
  naruto: { status:'130 LOCAL', connected:true }
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

function extractYgoPasscode(raw){
  const fixed=String(raw || '')
    .toUpperCase()
    .replace(/[OQD]/g,'0')
    .replace(/[IL|!]/g,'1')
    .replace(/Z/g,'2')
    .replace(/S/g,'5')
    .replace(/G/g,'6')
    .replace(/B/g,'8')
    .replace(/[^0-9]/g,'');
  const m=fixed.match(/\d{8}/);
  return m ? m[0] : '';
}

function extractVanguardCode(raw){
  const t=String(raw || '').toUpperCase().replace(/\s+/g,'').replace(/[|]/g,'I');
  const m=t.match(/[A-Z]{1,3}-[A-Z0-9]{2,12}\/[A-Z0-9-]{2,12}(?:EN)?/);
  return m ? m[0] : '';
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
  const [release,setRelease] = useState(null);
  const [nativeUpdate,setNativeUpdate] = useState(null);
  const [updaterBusy,setUpdaterBusy] = useState(false);
  const [updaterProgress,setUpdaterProgress] = useState(0);
  const [updaterMessage,setUpdaterMessage] = useState('');
  const [detectionOn,setDetectionOn] = useState(localStorage.getItem('auto_detection') === '1');
  const [detecting,setDetecting] = useState(false);
  const [lastOcr,setLastOcr] = useState('');
  const [lastDetected,setLastDetected] = useState('');
  const [autoOverlay,setAutoOverlay] = useState(localStorage.getItem('auto_overlay') === '1');
  const [selectedTcg,setSelectedTcg] = useState(localStorage.getItem('scan_tcg') || 'ygo');
  const [scanConfidence,setScanConfidence] = useState(0);
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
  const autoCandidateRef = useRef({ key:'', hits:0, at:0 });

  const connectedCount = apis.filter(a=>a.connected).length;
  const avgLatency = useMemo(()=>{
    const values = apis
      .filter(x=>x.connected && x.latency_ms>0)
      .map(x=>Number(x.latency_ms))
      .sort((a,b)=>a-b);
    if(!values.length) return 0;
    const mid=Math.floor(values.length/2);
    return values.length%2 ? values[mid] : Math.round((values[mid-1]+values[mid])/2);
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

        setBootStatus('Vérification des banques de données…');
        setBootProgress(38);
        const startupDefs=[
          ['ygo','YGOPRODeck',null,null],
          ['pokemon','Pokémon TCG',null,null],
          ['onepiece','One Piece',null,null],
          ['vanguard','Cardfight!! Vanguard',null,null],
          ['naruto','Naruto Mythos',null,null],
          ['magic','Magic / Scryfall',null,null],
          ['lorcana','Disney Lorcana',null,null],
          ['digimon','Digimon',null,null],
          ['dragonball','Dragon Ball Super',null,null],
          ['unionarena','Union Arena',null,null],
          ['weiss','Weiss Schwarz',null,null],
          ['fleshblood','Flesh and Blood',null,null]
        ];
        const startupResults=[];
        for(let i=0;i<startupDefs.length;i++){
          const [game,name,apiUrl,apiKey]=startupDefs[i];
          setBootStatus(`Vérification : ${name}…`);
          setBootProgress(38 + Math.round((i/startupDefs.length)*42));
          const result=await invoke('api_status',{game,apiUrl,apiKey})
            .catch(e=>({id:game,name,connected:false,count:null,latency_ms:0,detail:String(e)}));
          startupResults.push(result);
          addBootCheck(
            name,
            !!result.connected,
            result.connected
              ? (result.count != null ? `${fmtCount(result.count)} cartes` : (result.detail || 'Connecté'))
              : (result.detail || 'Indisponible')
          );
        }
        if(mounted) setApis(startupResults);

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

    const id=setInterval(refreshApis,3600000);
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
  useEffect(()=>{ localStorage.setItem('auto_detection',detectionOn?'1':'0'); },[detectionOn]);
  useEffect(()=>{
    localStorage.setItem('scan_tcg',selectedTcg);
    setLastOcr('');
    setLastDetected('');
    setQuery('');
    setCard(null);
    autoCandidateRef.current={key:'',hits:0};
  },[selectedTcg]);

  useEffect(()=>{
    clearInterval(detectionTimerRef.current);
    detectionTimerRef.current=null;
    autoCandidateRef.current={key:'',hits:0,at:0};
    if(!detectionOn || !cameraOn) return;
    const tick=()=>scanCameraCard({automatic:true});
    const warmup=setTimeout(tick,900);
    detectionTimerRef.current=setInterval(tick,2200);
    return()=>{
      clearTimeout(warmup);
      clearInterval(detectionTimerRef.current);
      detectionTimerRef.current=null;
    };
  },[detectionOn,cameraOn,selectedTcg]);

  async function refreshApis(){
    const defs=[
      ['ygo','YGOPRODeck',null,null],
      ['pokemon','Pokémon TCG',null,null],
      ['onepiece','One Piece',null,null],
      ['vanguard','Cardfight!! Vanguard',null,null],
      ['naruto','Naruto Mythos',null,null],
      ['magic','Magic / Scryfall',null,null],
      ['lorcana','Disney Lorcana',null,null],
      ['digimon','Digimon',null,null],
      ['dragonball','Dragon Ball Super',null,null],
      ['unionarena','Union Arena',null,null],
      ['weiss','Weiss Schwarz',null,null],
      ['fleshblood','Flesh and Blood',null,null]
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

  async function checkRelease(){
    try{
      setRelease(await invoke('check_latest_release'));
    }catch(e){
      console.warn(e);
    }

    await checkNativeUpdate(false);
  }

  async function checkNativeUpdate(showToast = true){
    if(updaterBusy) return;
    setUpdaterBusy(true);
    setUpdaterMessage('Vérification de la mise à jour…');
    try{
      const update = await checkForAppUpdate();
      setNativeUpdate(update);
      if(update){
        setUpdaterMessage(`Version ${update.version} disponible`);
        if(showToast) setToast(`Mise à jour ${update.version} disponible`);
      }else{
        setUpdaterMessage('Application à jour');
        if(showToast) setToast('TCG STREAM TOOL est à jour');
      }
    }catch(e){
      console.warn('Updater:', e);
      setUpdaterMessage('Mise à jour automatique non configurée ou indisponible');
      if(showToast) setToast(`Updater : ${String(e)}`);
    }finally{
      setUpdaterBusy(false);
    }
  }

  async function installNativeUpdate(){
    if(!nativeUpdate || updaterBusy) return;
    setUpdaterBusy(true);
    setUpdaterProgress(0);
    setUpdaterMessage(`Téléchargement de ${nativeUpdate.version}…`);
    let downloaded = 0;
    let contentLength = 0;
    try{
      await nativeUpdate.downloadAndInstall((event)=>{
        switch(event.event){
          case 'Started':
            contentLength = event.data.contentLength || 0;
            setUpdaterMessage(`Téléchargement de ${nativeUpdate.version}…`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength || 0;
            if(contentLength > 0){
              setUpdaterProgress(Math.min(100, Math.round(downloaded * 100 / contentLength)));
            }
            break;
          case 'Finished':
            setUpdaterProgress(100);
            setUpdaterMessage('Téléchargement terminé. Installation…');
            break;
          default:
            break;
        }
      });
      setUpdaterMessage('Installation lancée…');
    }catch(e){
      console.error('Updater install:', e);
      setUpdaterMessage('Échec de la mise à jour');
      setToast(`Mise à jour impossible : ${String(e)}`);
      setUpdaterBusy(false);
    }
  }

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
      if(selectedTcg==='naruto'){
        const q=value
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g,'')
          .toLowerCase()
          .trim();
        const numberMatch=q.match(/(?:^|\s)(\d{1,3})(?:\s*\/\s*130)?(?:$|\s)/);
        const idx=numberMatch?Number(numberMatch[1]):null;
        const entry=narutoSet1.find(x=>
          (idx!=null && x.index===idx) ||
          String(x.number||'').toLowerCase()===q ||
          String(x.set_code||'').toLowerCase()===q ||
          String(x.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q) ||
          String(x.title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)
        );
        if(!entry) throw new Error(`Aucune carte Naruto Mythos trouvée pour « ${value} »`);
        const r=makeNarutoCard(entry);
        setCard(r);
        setQuery(entry.number);
        setLastDetected(`${entry.title || entry.name} • ${entry.number} • base locale`);
        return r;
      }

      const apiLang=['fr','it'].includes(lang)?lang:'en';
      const r=await invoke('search_card_universal',{game:selectedTcg,query:value,language:apiLang});
      setCard(r);
      setLastDetected(`${r.name} • ${r.id || value} • recherche API`);
      return r;
    }catch(e){
      if(!forcedQuery) setToast(String(e));
      return null;
    } finally{ setSearching(false); }
  }

  async function showCardOnOverlay(target=card){
    if(!target) return;
    await invoke('set_overlay_card',{card:{visible:true,name:target.name,subtitle:[target.card_type,target.attribute,target.race].filter(Boolean).join(' • '),image_url:target.image_url,atk:target.atk,def:target.def,badge:(TCG_LABEL[selectedTcg] || 'TCG').toUpperCase()}});
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

  function getCardRect(video){
    const sourceW=video.videoWidth, sourceH=video.videoHeight;
    const cardW=Math.floor(sourceW*0.54);
    const cardH=Math.floor(Math.min(sourceH*0.82, cardW*1.45));
    return {
      x:Math.floor((sourceW-cardW)/2),
      y:Math.floor((sourceH-cardH)/2),
      w:cardW,
      h:cardH
    };
  }

  function captureZone(kind){
    const video=videoRef.current;
    if(!video || !video.videoWidth || !video.videoHeight) throw new Error('La caméra n’est pas prête');
    const r=getCardRect(video);
    let zx=r.x, zy=r.y, zw=r.w, zh=r.h;

    if(kind==='ygo-passcode'){
      // Le passcode YGO est très petit, tout en bas à gauche : on zoome fortement dessus.
      zx=r.x; zy=r.y+Math.floor(r.h*.79); zw=Math.floor(r.w*.64); zh=Math.floor(r.h*.21);
    }else if(kind==='ygo-passcode-wide'){
      // Zone de secours si la carte est légèrement décalée / inclinée.
      zx=r.x; zy=r.y+Math.floor(r.h*.70); zw=Math.floor(r.w*.72); zh=Math.floor(r.h*.30);
    }else if(kind==='bottom-left'){
      zx=r.x; zy=r.y+Math.floor(r.h*.65); zw=Math.floor(r.w*.62); zh=Math.floor(r.h*.35);
    }else if(kind==='vanguard-code'){
      zx=r.x+Math.floor(r.w*.28); zy=r.y+Math.floor(r.h*.74); zw=Math.floor(r.w*.72); zh=Math.floor(r.h*.26);
    }else if(kind==='bottom-right'){
      zx=r.x+Math.floor(r.w*.34); zy=r.y+Math.floor(r.h*.65); zw=Math.floor(r.w*.66); zh=Math.floor(r.h*.35);
    }else if(kind==='naruto-number'){
      zx=r.x; zy=r.y+Math.floor(r.h*.70); zw=Math.floor(r.w*.60); zh=Math.floor(r.h*.30);
    }else if(kind==='naruto-number-wide'){
      zx=r.x; zy=r.y+Math.floor(r.h*.60); zw=Math.floor(r.w*.72); zh=Math.floor(r.h*.40);
    }else if(kind==='naruto-edition'){
      zx=r.x+Math.floor(r.w*.48); zy=r.y+Math.floor(r.h*.72); zw=Math.floor(r.w*.52); zh=Math.floor(r.h*.28);
    }

    const canvas=document.createElement('canvas');
    canvas.width=1200;
    canvas.height=Math.max(220,Math.round(zh*(1200/zw)));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,zx,zy,zw,zh,0,0,canvas.width,canvas.height);

    const img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const d=img.data;
    for(let i=0;i<d.length;i+=4){
      const g=Math.round(d[i]*.299+d[i+1]*.587+d[i+2]*.114);
      const v=g<135?Math.max(0,g-38):Math.min(255,g+48);
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(img,0,0);
    return canvas;
  }

  function analyzeCardFrame(){
    const video=videoRef.current;
    if(!video || !video.videoWidth || !video.videoHeight) throw new Error('La caméra n’est pas prête');
    const r=getCardRect(video);
    const canvas=document.createElement('canvas');
    canvas.width=240; canvas.height=348;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,r.x,r.y,r.w,r.h,0,0,canvas.width,canvas.height);
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let sum=0, sum2=0, edges=0, samples=0;
    const gray=new Uint8Array(canvas.width*canvas.height);
    for(let i=0,p=0;i<data.length;i+=4,p++){
      const g=Math.round(data[i]*.299+data[i+1]*.587+data[i+2]*.114);
      gray[p]=g; sum+=g; sum2+=g*g; samples++;
    }
    const mean=sum/samples;
    const variance=Math.max(0,sum2/samples-mean*mean);
    for(let y=1;y<canvas.height;y+=3){
      for(let x=1;x<canvas.width;x+=3){
        const i=y*canvas.width+x;
        if(Math.abs(gray[i]-gray[i-1])>32 || Math.abs(gray[i]-gray[i-canvas.width])>32) edges++;
      }
    }
    const edgeRatio=edges/((Math.floor((canvas.height-1)/3)+1)*(Math.floor((canvas.width-1)/3)+1));
    const score=Math.max(0,Math.min(100,Math.round((Math.min(variance,3200)/3200)*60 + Math.min(edgeRatio,.22)/.22*40)));
    return {score, variance, edgeRatio};
  }

  function stableAutoCandidate(key){
    const now=Date.now();
    const prev=autoCandidateRef.current;
    if(prev.key===key && now-prev.at<6500){
      const next={key,hits:prev.hits+1,at:now};
      autoCandidateRef.current=next;
      return next.hits>=2;
    }
    autoCandidateRef.current={key,hits:1,at:now};
    return false;
  }

  async function recognizeZone(worker,kind,whitelist){
    if(whitelist){
      await worker.setParameters({
        tessedit_char_whitelist:whitelist,
        preserve_interword_spaces:'1'
      });
    }
    const result=await worker.recognize(captureZone(kind));
    return {
      text:String(result?.data?.text || '').trim(),
      confidence:Number(result?.data?.confidence || 0)
    };
  }

  async function recognizeBest(worker, zones, whitelist, extractor){
    const attempts=[];
    for(const zone of zones){
      const r=await recognizeZone(worker,zone,whitelist);
      const code=extractor(r.text);
      attempts.push({...r,code,zone});
      if(code && r.confidence>=80) break;
    }
    attempts.sort((a,b)=>{
      if(Boolean(a.code)!==Boolean(b.code)) return a.code ? -1 : 1;
      return b.confidence-a.confidence;
    });
    return attempts[0] || {text:'',confidence:0,code:'',zone:''};
  }

  function extractNarutoNumber(text){
    const normalized=String(text || '')
      .toUpperCase()
      .replace(/[OQ]/g,'0')
      .replace(/[IL|]/g,'1')
      .replace(/\s+/g,' ')
      .trim();
    const compact=normalized.replace(/\s+/g,'');
    let m=compact.match(/(?:^|\D)(\d{1,3})\/130(?:\D|$)/);
    if(!m) m=compact.match(/(?:^|\D)(\d{1,3})130(?:\D|$)/);
    if(!m) return '';
    const idx=Number(m[1]);
    return idx>=1 && idx<=130 ? `${idx}/130` : '';
  }


  function normalizeNarutoName(text){
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function narutoNameFromOcr(text){
    const hay=normalizeNarutoName(text);
    if(hay.length<3) return null;
    let best=null;
    let bestScore=0;
    for(const entry of narutoSet1){
      const names=[entry.name,entry.title].filter(Boolean).map(normalizeNarutoName);
      for(const n of names){
        if(!n) continue;
        if(hay.includes(n) || n.includes(hay)){
          const score=Math.min(hay.length,n.length)/Math.max(hay.length,n.length);
          if(score>bestScore){ best=entry; bestScore=score; }
        }else{
          const words=n.split(' ').filter(w=>w.length>=4);
          const hits=words.filter(w=>hay.includes(w)).length;
          const score=words.length ? hits/words.length : 0;
          if(score>bestScore){ best=entry; bestScore=score; }
        }
      }
    }
    return bestScore>=0.5 ? best : null;
  }

  function captureCardImage(){
    try{
      const video=videoRef.current;
      if(!video || !video.videoWidth || !video.videoHeight) return '';
      const r=getCardRect(video);
      const canvas=document.createElement('canvas');
      canvas.width=560;
      canvas.height=Math.round(560*(r.h/r.w));
      const ctx=canvas.getContext('2d');
      ctx.drawImage(video,r.x,r.y,r.w,r.h,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/jpeg',0.9);
    }catch{
      return '';
    }
  }

  function captureCardImageForApi(){
    const video=videoRef.current;
    if(!video || !video.videoWidth || !video.videoHeight) throw new Error('La caméra n’est pas prête');
    const r=getCardRect(video);
    const canvas=document.createElement('canvas');
    canvas.width=320;
    canvas.height=Math.round(320*(r.h/r.w));
    const ctx=canvas.getContext('2d');
    ctx.drawImage(video,r.x,r.y,r.w,r.h,0,0,canvas.width,canvas.height);
    let quality=.66;
    let data=canvas.toDataURL('image/jpeg',quality);
    while(data.length>132000 && quality>.34){
      quality-=.08;
      data=canvas.toDataURL('image/jpeg',quality);
    }
    if(data.length>136000) throw new Error('Image trop lourde pour l’analyse. Rapproche la carte et réessaie.');
    return data;
  }

  function extractGenericReference(text){
    const raw=String(text || '').toUpperCase().replace(/[–—]/g,'-');
    const patterns=[
      /\b[A-Z]{1,5}[- ]?[A-Z0-9]{1,8}\/\d{1,4}[A-Z]{0,3}\b/,
      /\b[A-Z]{1,6}[- ]?\d{1,4}[- ]?[A-Z]{0,4}\d{0,4}\b/,
      /\b\d{1,4}\/\d{1,4}\b/,
      /\b[A-Z]{1,5}\d{1,5}\b/
    ];
    for(const p of patterns){
      const m=raw.match(p);
      if(m) return m[0].replace(/\s+/g,'');
    }
    return '';
  }

  function ocrCardMatchScore(card, fullText, refText){
    const hay=normalizeCardText(`${fullText || ''} ${refText || ''}`);
    if(!hay) return 0;
    const name=normalizeCardText(card?.name || '');
    const id=normalizeCardText(card?.id || '').replace(/\s+/g,'');
    let score=0;
    if(name){
      if(hay.includes(name)) score=Math.max(score,100);
      else {
        const words=name.split(' ').filter(w=>w.length>=3);
        if(words.length){
          const hits=words.filter(w=>hay.includes(w)).length;
          score=Math.max(score,Math.round((hits/words.length)*92));
        }
      }
    }
    if(id){
      const compact=hay.replace(/\s+/g,'');
      if(compact.includes(id)) score=Math.max(score,100);
      else {
        const ref=normalizeCardText(refText || '').replace(/\s+/g,'');
        if(ref && (ref.includes(id) || id.includes(ref))) score=Math.max(score,90);
      }
    }
    return score;
  }

  function pickOcrSearchCandidate(text){
    const lines=String(text || '')
      .split(/\n+/)
      .map(cleanOcrText)
      .filter(x=>x.length>=3 && x.length<=70)
      .filter(x=>/[A-Za-zÀ-ÿ]/.test(x));
    lines.sort((a,b)=>b.length-a.length);
    return lines[0] || '';
  }

  function makeNarutoCard(entry, editionText='', imageUrl=''){
    const first=/1ST|1RE|1ERE|1ÈRE|FIRST/i.test(editionText);
    return {
      name:entry.title || entry.name,
      description:`Naruto Mythos • ${entry.set} • ${entry.number}${first?' • 1ère édition':''}`,
      card_type:'Naruto Mythos',
      attribute:first?'1ère édition':'Édition non confirmée',
      race:entry.set_code,
      atk:null,
      def:null,
      image_url:imageUrl || entry.image_url || '',
      source:'Base locale Naruto Mythos'
    };
  }

  async function acceptLowConfidence(label,confidence){
    if(confidence>=85) return true;
    return window.confirm(`Confiance OCR ${Math.round(confidence)}%\n\nRésultat détecté : ${label}\n\nConfirmer cette carte ?`);
  }

  async function scanCameraCard({automatic=false}={}){
    if(!cameraOn || detectingRef.current) return;
    if(automatic && !detectionOn) return;
    detectingRef.current=true;
    setDetecting(true);
    setLastDetected('');

    try{
      const visual=analyzeCardFrame();
      if(visual.score<24){
        if(!automatic) throw new Error('Aucune carte suffisamment nette détectée dans le cadre.');
        setLastOcr(`Carte non détectée • visuel ${visual.score}%`);
        return;
      }

      let found=null;
      let detectedCode='';
      let confidence=0;

      if(selectedTcg==='naruto'){
        const worker=await getVisionWorker();

        // Naruto Mythos : le numéro n'est pas toujours au même pixel selon cadrage/édition.
        // On tente plusieurs bandes basses puis on lit aussi toute la carte pour récupérer le nom.
        const numberRead=await recognizeBest(
          worker,
          ['naruto-number','naruto-number-wide','bottom-left','bottom-wide'],
          '0123456789/OQIL',
          extractNarutoNumber
        );
        const editionRead=await recognizeZone(
          worker,
          'naruto-edition',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789èéÈÉ'
        );
        const fullRead=await recognizeZone(
          worker,
          'card-full',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -éèêàùçÉÈÊÀÙÇ/'
        );

        detectedCode=numberRead.code || extractNarutoNumber(fullRead.text) || '';
        confidence=Math.max(numberRead.confidence || 0, detectedCode ? (fullRead.confidence || 0) : 0);

        let entry=null;
        const m=detectedCode.match(/^(\d{1,3})\/130$/);
        if(m){
          entry=narutoSet1.find(x=>x.index===Number(m[1])) || null;
        }
        if(!entry){
          entry=narutoNameFromOcr(`${fullRead.text || ''} ${numberRead.text || ''}`);
          if(entry) detectedCode=entry.number;
        }

        const rawPreview=cleanOcrText(fullRead.text || numberRead.text || '');
        setLastOcr(`${detectedCode || 'code ?'} • ${Math.round(confidence)}% | ${rawPreview || 'nom ?'}`);

        if(!entry){
          if(automatic) return;
          throw new Error('Carte Naruto non reconnue. Cadre toute la carte : le logiciel cherche maintenant le numéro x/130 ET le nom de la carte.');
        }

        // Pour Naruto, la validation finale se fait contre la base locale 1..130.
        const stableKey=`naruto:${entry.index}`;
        if(automatic){
          if(confidence<35) return;
          if(!stableAutoCandidate(stableKey)){
            setLastDetected(`Carte lue • vérification 1/2 • ${entry.title}`);
            return;
          }
        }else if(confidence<35 && !(await acceptLowConfidence(`${entry.title} (${entry.number})`,confidence))){
          return;
        }

        found=makeNarutoCard(entry,editionRead.text,captureCardImage());
        found.id=entry.number;
        found.number=entry.number;
        found.set=entry.set;
      }else{
        // Reconnaissance hybride : 1) image complète via moteur visuel public,
        // 2) OCR local du nom / numéro, 3) fiche API complète, 4) validation croisée.
        const imageDataUrl=captureCardImageForApi();
        const displayCapture=captureCardImage();
        let result=null;
        let visualError=null;

        try{
          result=await invoke('scan_open_tcg',{game:selectedTcg,imageDataUrl});
          found=result.card;
          confidence=Number(result.score || 0);
        }catch(err){
          visualError=err;
        }

        const worker=await getVisionWorker();
        const fullRead=await recognizeZone(
          worker,
          'card-full',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÄÇÉÈÊËÍÎÏÓÔÖÙÛÜ0123456789-/:. '
        );
        const refRead=await recognizeZone(
          worker,
          'bottom-wide',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/: '
        );
        const genericRef=extractGenericReference(`${refRead.text || ''} ${fullRead.text || ''}`);
        const ocrName=pickOcrSearchCandidate(fullRead.text);

        // Si le moteur visuel ne répond pas, on tente une récupération API à partir du code/nom OCR.
        if(!found){
          try{
            if(selectedTcg==='ygo'){
              const pass=extractYgoPasscode(`${refRead.text || ''} ${fullRead.text || ''}`);
              if(pass) found=await invoke('search_ygo_by_id',{passcode:pass});
            }else if(selectedTcg==='vanguard'){
              const code=extractVanguardCode(`${refRead.text || ''} ${fullRead.text || ''}`);
              if(code) found=await invoke('search_vanguard_by_code',{code});
            }else{
              const q=genericRef || ocrName;
              if(q) found=await invoke('search_card_universal',{game:selectedTcg,query:q,language:apiLang});
            }
            if(found) confidence=Math.max(Number(fullRead.confidence || 0),Number(refRead.confidence || 0),55);
          }catch{/* la vraie erreur sera affichée plus bas */}
        }

        if(!found){
          throw new Error(`Carte non reconnue par l’IA visuelle ni par l’OCR/API.${visualError ? ` ${String(visualError)}` : ''}`);
        }

        detectedCode=String(found?.id || result?.product_id || genericRef || '');
        const ocrMatch=ocrCardMatchScore(found,fullRead.text,`${genericRef} ${refRead.text || ''}`);
        const visualScore=Number(result?.score || confidence || 0);
        // Le score final conserve le visuel comme signal principal et ajoute la confirmation OCR.
        confidence=Math.min(100,Math.round(Math.max(visualScore,visualScore*0.82+ocrMatch*0.18)));

        found={
          ...found,
          image_url:found?.image_url || displayCapture,
          source:'IA visuelle + OCR local + API',
          reference:found?.id || genericRef || '',
          ocr_name:ocrName,
          ocr_reference:genericRef
        };

        const proof=[
          detectedCode || genericRef || 'référence ?',
          `${Math.round(visualScore)}% visuel`,
          ocrMatch ? `${ocrMatch}% OCR` : 'OCR sans confirmation'
        ].join(' • ');
        setLastOcr(proof);

        if(automatic){
          if(confidence<68) return;
          const stableKey=`${selectedTcg}:${result?.product_id || detectedCode || found?.name}`;
          if(!stableAutoCandidate(stableKey)){
            setLastDetected(`Carte reconnue • vérification 1/2 • ${found?.name || detectedCode}`);
            return;
          }
        }else if(confidence<75 && !(await acceptLowConfidence(`${found?.name || detectedCode}${detectedCode ? ` • ${detectedCode}` : ''}`,confidence))){
          return;
        }
      }

      if(!found) throw new Error('Carte non reconnue.');
      setScanConfidence(Math.round(confidence));
      setCard(found);
      setQuery(found.name || detectedCode);
      setLastDetected(`${found.name || detectedCode} • ${found.id || detectedCode || 'carte'} • confirmé`);
      setToast(`${tr.detected} : ${found.name || detectedCode}`);
      if(autoOverlay) await showCardOnOverlay(found);
    }catch(e){
      console.warn('Vision:',e);
      if(!automatic) setToast(String(e));
      if(!automatic && !lastOcr) setLastOcr('Aucune carte valide');
    }finally{
      detectingRef.current=false;
      setDetecting(false);
    }
  }

  function stopDetection(){
    clearInterval(detectionTimerRef.current);
    detectionTimerRef.current=null;
    setDetectionOn(false);
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
    setSettingsOpen(false); refreshApis();
  }

  useEffect(()=>{ if(!toast) return; const id=setTimeout(()=>setToast(''),3000); return()=>clearTimeout(id); },[toast]);

  if(!booting && wizardOpen){
    const tcgOptions=TCG_OPTIONS;

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
      <div className="brand"><div className="logo">TCG</div><div><b>STREAM TOOL</b><span>THEMED EDITION • v1.0.13</span></div></div>
      <div className="header-update" title="Mises à jour de TCG STREAM TOOL">
        <div className="header-update-versions">
          <strong>MISE À JOUR</strong>
          <span>Actuelle : <b>{release?.current || '1.0.13'}</b></span>
          <span>Dernière : <b>{nativeUpdate?.version || release?.latest || '—'}</b></span>
        </div>
        {(nativeUpdate || release?.update_available) ? (
          <button
            className="header-update-btn available"
            onClick={nativeUpdate ? installNativeUpdate : ()=>checkNativeUpdate(true)}
            disabled={updaterBusy}
          >
            {updaterBusy ? (updaterProgress > 0 ? `${updaterProgress}%` : 'Vérification…') : (nativeUpdate ? 'METTRE À JOUR' : 'VÉRIFIER')}
          </button>
        ) : (
          <button
            className="header-update-btn"
            onClick={()=>checkNativeUpdate(true)}
            disabled={updaterBusy}
          >
            {updaterBusy ? 'Vérification…' : 'À JOUR'}
          </button>
        )}
      </div>
      <div className="top-actions">
        <select value={lang} onChange={e=>setLang(e.target.value)}><option value="fr">FR</option><option value="en">EN</option><option value="es">ES</option><option value="it">IT</option></select>
        <div className="mode-select-wrap" title="Choisir le TCG à scanner">
          <span className="mode-diamond">◆</span>
          <select
            className="mode mode-select"
            value={selectedTcg}
            onChange={e=>setSelectedTcg(e.target.value)}
            aria-label="TCG à scanner"
          >
            {TCG_OPTIONS.map(([id,name])=><option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <button className="iconbtn" onClick={()=>setSettingsOpen(true)}>⚙</button>
      </div>
    </header>

    <main className="layout">
      <section className="leftcol">
        <div className="panel">
          <div className="panel-title"><span>▱ {tr.overlays}</span><span className="chip">{TCG_LABEL[selectedTcg] || selectedTcg}</span></div>
          {['Cam Frame','Card Pop'].map((x,i)=><div className="toggle-row" key={x}><div><b>{x}</b><small>{i===0?'Cadre caméra':'Carte détectée'}</small></div><span className="switch on"></span></div>)}
        </div>

        <div className="panel">
          <div className="panel-title">▰ {tr.sources}</div>
          {TCG_OPTIONS.map(([id,name])=>{
            const a=apis.find(x=>x.id===id);
            const local=LOCAL_SOURCE_INFO[id];
            const connected=a ? a.connected : Boolean(local?.connected);
            let value='…';
            if(a) value=a.connected ? (a.count != null ? fmtCount(a.count) : 'API') : 'OFF';
            else if(local?.status) value=local.status;
            return <div className="source-row" key={id}>
              <span><i className={connected?'dot ok':'dot'}></i>{name}</span>
              <b>{value}</b>
            </div>;
          })}
          <div className="source-row sep"><span>{tr.latency} API</span><b>~{avgLatency || '—'} ms</b></div>
          <button className="ghost full" onClick={refreshApis}>{tr.refresh}</button>
        </div>
      </section>

      <section className="centercol">
        <div className="camera-panel">
          <div className="live-badge"><i></i> LIVE</div>
          <div className={cameraOn?'vision-guide active':'vision-guide'}><span>{selectedTcg==='naruto'?'NUMÉRO + ÉDITION':'CARTE ENTIÈRE • API VISUELLE'}</span></div>
          <video ref={videoRef} className={cameraOn?'camera-video':'camera-video hidden'} playsInline muted />
          {!cameraOn && <div className="camera-empty"><div className="cam-icon">◉</div><h3>{tr.camOff}</h3><button className="primary" onClick={()=>startCamera()}>Activer la caméra</button></div>}
          <div className="camera-bottom"><span>● {cameraOn?`LIVE • ${camFps || '—'} FPS`:'OFFLINE'}</span><div className="cam-actions">
            {cameraOn && <select value={deviceId} onChange={e=>{setDeviceId(e.target.value);startCamera(e.target.value)}}>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||tr.chooseCam}</option>)}</select>}
            {cameraOn && <button className="ghost" onClick={stopCamera}>Stop</button>}
          </div></div>
        </div>

        <form className="searchbar" onSubmit={searchCard}>
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder={selectedTcg==='naruto'?'Rechercher Naruto : nom, 125/130 ou KS-125':`Rechercher ${TCG_LABEL[selectedTcg] || 'TCG'} : nom ou numéro de carte`}
            disabled={false}
          />
          <button className="primary" disabled={searching}>{searching?'…':'Rechercher'}</button>
        </form>

        <div className="card-panel">
          {card ? <>
            <div className="card-art">{card.image_url?<img src={card.image_url} alt=""/>:<span>CARTE</span>}</div>
            <div className="card-info"><div className="goldline">♛ {TCG_LABEL[selectedTcg] || 'TCG'} • DÉTECTION PAR CODE</div><h1>{card.name}</h1><div className="stats"><span>{card.atk!=null?`ATK ${card.atk}`:(card.card_type || 'CARTE')}</span><span>{card.def!=null?`DEF ${card.def}`:(card.attribute || 'IDENTIFIÉE')}</span></div><p>{card.description?.slice(0,240)}{card.description?.length>240?'…':''}</p><small>{card.card_type} • {card.attribute} • {card.race}</small><div className="actions"><button className="primary" onClick={showOnOverlay} type="button">{tr.send}</button><button className="ghost" onClick={hideOverlay} type="button">{tr.hide}</button></div></div>
          </> : <div className="empty-card">Recherchez ou scannez une carte pour l’afficher ici et sur votre overlay OBS.</div>}
        </div>
      </section>

      <section className="rightcol">
        <div className="panel">
          <div className="panel-title">◉ STREAM STATS</div>
          <div className="statgrid"><div><strong>{avgLatency||'—'}<small>ms</small></strong><span>{tr.latency} API</span></div><div><strong>{camFps||'—'}</strong><span>{tr.fps}</span></div></div>
          <div className="api-badge"><i className="dot ok"></i>{tr.api} • {connectedCount}/{apis.length || 5}</div>
        </div>
        <div className="panel overlay-box">
          <div className="panel-title">◎ {tr.overlayUrl}</div>
          <code>{overlayUrl || '...'}</code>
          <button className="primary full" onClick={copyOverlay}>{tr.copy}</button>
          <small>OBS → Source navigateur → 1920 × 1080. Le lien fonctionne uniquement pendant que TCG STREAM TOOL est ouvert.</small>
        </div>
        <div className="panel vision-panel">
          <div className="panel-title">⌁ SCANNER UNE CARTE</div>
          <div className={(detecting || detectionOn)?'vision-status on':'vision-status'}><i className={(detecting || detectionOn)?'dot ok':'dot'}></i>{detecting?'Analyse carte + code…':detectionOn?'Détection automatique active • analyse toutes les 2,2 s':'Prêt — mode manuel'}</div>
          <label className="checkline"><input type="checkbox" checked={detectionOn} onChange={e=>setDetectionOn(e.target.checked)}/><span>Détection automatique — analyser la carte et son code</span></label>
          <button className="primary full scan-main" disabled={!cameraOn || detecting} onClick={()=>scanCameraCard({automatic:false})}>{detecting?'Analyse…':'SCANNER MAINTENANT'}</button>
          <label className="checkline"><input type="checkbox" checked={autoOverlay} onChange={e=>setAutoOverlay(e.target.checked)}/><span>{tr.autoOverlay}</span></label>
          <small>{selectedTcg==='naruto'?'Naruto Mythos : lit le numéro x/130 + l’édition et vérifie la base locale.':'IA hybride : analyse visuelle de la carte entière + OCR du nom/numéro + vérification API. Le nom, la référence, le set et l’image sont ensuite affichés dans l’application et dans OBS.'}</small>
          <div className="ocr-box"><span>OCR / CODE</span><b>{lastOcr || '—'}</b></div>
          {lastDetected && <div className="detected-box"><span>{tr.detected}</span><b>{lastDetected}</b></div>}
        </div>
      </section>
    </main>

    {settingsOpen && <div className="modalback" onMouseDown={()=>setSettingsOpen(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
      <h2>{tr.settings}</h2>
      <label>Nom de streamer<input value={profile.streamer} onChange={e=>setProfile({...profile,streamer:e.target.value})}/></label>
      <label>Nom de chaîne<input value={profile.channel} onChange={e=>setProfile({...profile,channel:e.target.value})}/></label>
      <label>Plateforme<select value={profile.platform} onChange={e=>setProfile({...profile,platform:e.target.value})}><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="other">Autre</option></select></label>
      <label>TCG par défaut<select value={selectedTcg} onChange={e=>setSelectedTcg(e.target.value)}>{TCG_OPTIONS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <p>Les API publiques sont intégrées directement dans TCG STREAM TOOL : aucune clé API n’est demandée à l’utilisateur.</p>
      <div className="actions">
        <button className="primary" onClick={()=>{persistProfile(profile);saveSettings();}}>{tr.save}</button>
        <button className="ghost" onClick={()=>{setWizardStep(1);setWizardOpen(true);setSettingsOpen(false);}}>Assistant de profil</button>
        <button className="ghost" onClick={()=>setSettingsOpen(false)}>Fermer</button>
      </div>
    </div></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>
}
