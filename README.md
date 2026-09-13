# TCG STREAM TOOL v1.0.5 - BUILD FIX
© 2026 Reddice Geek

## Version actuelle : v1.0.5 (13/09/2026) - FIX BUILD
C'est la version qui build enfin l'exe.

### Installation Windows
1. Va dans Releases > v1.0.5
2. Télécharge TCG-STREAM-TOOL_1.0.5_x64-setup.exe
3. Lance > Accepte la charte légale © 2026 Reddice Geek (obligatoire)
4. Choisis langue EN/FR/ES/IT
5. Fin: Lancer / Lire README / Redémarrer

### 12 TCGs
YGO 12 458, Pokémon 18 204, One Piece 3 300, Magic 54 000, Dragon Ball 8 500+, Vanguard 5 200+, Digimon 2 800+, Lorcana 500+, SWU 500+, Riftbound 300+, Naruto 1 000+, Mythos 400+

### Fonctionnalités
- Overlay: http://localhost:8765/overlay - OBS/Streamlabs
- Mode discret + enregistrement 720p/1080p/4K/8K
- Détection placement cartes via cam
- Thèmes: YGO Duel Disk Or + cimetière, One Piece Wanted, Pokémon Pokédex Shiny
- Multilingue + charte légale bloquante

## CHANGELOG DEPUIS v1.0.1

### v1.0.5 - BUILD FIX - 13/09/2026 [ACTUELLE]
- FIX CRITIQUE: Ajout src-tauri/src/lib.rs manquant. Tauri v2 a BESOIN de lib.rs + main.rs, c'est pour ça que t'avais "npm run tauri build failed exit code 1"
- FIX: Cargo.toml avec [lib] name = "tcg_stream_tool_lib" + crate-type
- FIX: Icône 1x1 remplacée par vraie icône 512x512 TCG cyan #00E5FF sur noir
- FIX: Workflow GitHub: Node 20 -> Node 22, ajout npm run build séparé avant tauri build, ajout Rust cache
- FIX: vite.config.js outDir: 'dist' explicite
- FIX: capabilities/default.json permissions shell:allow-open
- RESULTAT: Build Windows + Linux passe vert -> génère.exe +.deb + AppImage dans Releases

### v1.0.4 - Icon Fix - 13/09/2026
- Tentative fix icône 512x512
- Dossier pollué avec fichiers _1 (bug de zip)
- Build encore fail

### v1.0.3 - Structure Fix - 13/09/2026
- Ajout ic
