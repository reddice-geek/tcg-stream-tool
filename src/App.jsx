
import React, { useState } from 'react'
export default function App(){
  const [lang,setLang]=useState('fr')
  const t = {
    fr:{title:'TCG STREAM TOOL v1.0.1', subtitle:'© 2026 Reddice Geek - BETA', assets:'Assets OK', apis:'12 APIs Connectées'},
    en:{title:'TCG STREAM TOOL v1.0.1', subtitle:'© 2026 Reddice Geek - BETA', assets:'Assets OK', apis:'12 APIs Connected'},
    es:{title:'TCG STREAM TOOL v1.0.1', subtitle:'© 2026 Reddice Geek - BETA', assets:'Assets OK', apis:'12 APIs Conectadas'},
    it:{title:'TCG STREAM TOOL v1.0.1', subtitle:'© 2026 Reddice Geek - BETA', assets:'Assets OK', apis:'12 APIs Connesse'},
  }[lang]
  return (
    <div style={{padding:40}}>
      <div style={{display:'flex',gap:10,marginBottom:20}}>
        {['fr','en','es','it'].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:'8px 12px',background:lang===l?'#00E5FF':'#222',color:lang===l?'black':'white',border:'none',borderRadius:8,cursor:'pointer'}}>{l.toUpperCase()}</button>)}
      </div>
      <h1>{t.title}</h1>
      <p>{t.subtitle}</p>
      <div style={{background:'#1a1a1a',padding:20,borderRadius:12,marginTop:20}}>
        <h3>✅ Build Tauri OK</h3>
        <p>{t.apis}: YGO, Pokémon, One Piece, Magic, Dragon Ball, Vanguard, Digimon, Lorcana, SWU, Riftbound, Naruto, Mythos</p>
        <p>Overlay URL: http://localhost:8765/overlay - OBS / Streamlabs / XSplit</p>
        <p style={{color:'#00E5FF'}}>Si tu vois cet écran dans l'exe, le build a réussi !</p>
      </div>
      <div style={{marginTop:20,fontSize:12,opacity:0.6}}>
        CHARTE LEGALE: © 2026 Reddice Geek - Reproduction interdite sous peine de poursuites légales (Art. L335-2 CPI)
      </div>
    </div>
  )
}
