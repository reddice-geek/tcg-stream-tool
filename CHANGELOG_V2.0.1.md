# TCG Stream Tool v2.0.1

## Nouveautés
- Refonte de la logique de scan en mode hybride : tentative d’identification visuelle via le service de scan du TCG sélectionné, puis retour automatique à l’OCR local en cas d’indisponibilité.
- Conservation de l’illustration de la carte issue de la base lorsqu’une correspondance visuelle est trouvée.
- Ajout de quatre thèmes visuels : Cyber Neon, Obsidian Gold, Arcade Violet et Emerald Stream. Le choix est mémorisé sur l’ordinateur.
- Version affichée dans l’interface et titre de fenêtre alimentés depuis `package.json`.
- Ajout de `npm run sync-version` pour synchroniser automatiquement `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml` avant compilation.
- Workflow GitHub Actions mis à jour pour synchroniser les versions avant de générer l’installateur.

## Reconnaissance : limites à connaître
- Le service de scan distant doit être disponible et prendre en charge le jeu choisi pour produire une identification visuelle.
- En cas d’échec, le logiciel revient à l’OCR local, qui peut lire du texte sans toujours identifier avec certitude l’impression exacte de la carte.
- Les résultats de la v2.0.1 doivent être testés avec les vraies caméras, cartes et jeux ciblés avant de considérer la reconnaissance comme validée.

## Windows
- La version du nom de l’installateur est générée depuis la configuration Tauri synchronisée.
- Sans certificat de signature de code reconnu, Smart App Control ou d’autres politiques Windows peuvent encore bloquer un exécutable non signé. Cette version ne désactive aucune protection Windows.
