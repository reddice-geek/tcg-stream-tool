# TCG STREAM TOOL

Application Windows TCG STREAM TOOL par **Reddice Geek**.

## Génération automatique du `.exe`

GitHub Actions compile l'application automatiquement :

- à chaque push sur `main` ou `master` : ouvrez **Actions**, puis le workflow **Build Windows EXE** et téléchargez l'artefact `TCG-STREAM-TOOL-Windows-EXE` ;
- pour publier une version dans **Releases** : mettez à jour les numéros de version dans `package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`, créez un tag (par exemple `v2.0.1`) et poussez-le :

```bash
git tag v2.0.1
git push origin v2.0.1
```

Le workflow compile alors l'installateur Windows `.exe` et le joint à la Release GitHub. Il n'exige pas de secret de signature Tauri pour compiler l'installateur.

## Détection des cartes

Le scan manuel tente d'abord la reconnaissance visuelle à partir du catalogue distant pris en charge. Si le service échoue ou ne renvoie pas de résultat suffisamment exploitable, le scanner revient à l'OCR local. La qualité dépend notamment de l'éclairage, de l'angle, de la mise au point et de la carte choisie. Le scan automatique reste local pour éviter d'envoyer une image à un service distant à chaque cycle.

## Avertissement Microsoft Defender SmartScreen

Le build automatique ne rend pas automatiquement l'éditeur « reconnu ». Tant que le fichier `.exe` n'est pas signé avec un certificat de signature de code reconnu, Windows peut afficher « Windows a protégé votre ordinateur » ou « éditeur inconnu ». Pour faire disparaître durablement cet avertissement, il faut signer l'application avec un certificat adapté et protéger la clé de signature dans les secrets GitHub. Ne désactivez pas Defender pour installer une application dont la provenance n'est pas vérifiée.

Les utilisateurs n'ont pas besoin d'installer Node.js, Rust, Tauri ou Git.


## Signature numérique Windows (Smart App Control)

Le workflow prend en charge la signature numérique, mais il ne peut pas créer une identité de signature de confiance à lui seul. Sans certificat reconnu, les installateurs et exécutables produits restent non signés et Windows Smart App Control peut continuer à les bloquer.

Pour activer la signature :

1. Obtenez un certificat de signature de code adapté auprès d'une autorité reconnue par le Microsoft Trusted Root Program, ou utilisez le service Microsoft Artifact Signing si vous y êtes admissible. Un certificat auto-signé ne suffit pas pour la confiance Smart App Control.
2. Exportez le certificat avec sa clé privée au format PFX, en respectant les conditions de votre fournisseur.
3. Convertissez le PFX en Base64 et ajoutez deux secrets au dépôt GitHub, dans **Settings → Secrets and variables → Actions** :
   - `WINDOWS_CERTIFICATE_BASE64` : contenu Base64 du PFX ;
   - `WINDOWS_CERTIFICATE_PASSWORD` : mot de passe du PFX.
4. Relancez le workflow. Il importe le certificat sur le runner, signe l'exécutable principal avant la création du bundle NSIS, signe ensuite l'installateur et vérifie les signatures.

Ne commitez jamais le fichier PFX, son mot de passe ou sa clé privée dans le dépôt. Limitez l'accès aux secrets et protégez les permissions de publication.

### Important

- Sans les deux secrets, le workflow construit tout de même l'application, mais elle n'est pas signée. Ce n'est pas une correction suffisante pour Smart App Control.
- La signature doit utiliser un certificat reconnu et une chaîne valide. Une signature valide améliore la confiance mais ne constitue pas une garantie absolue contre tous les blocages de sécurité.
- Le workflow utilise le tag de la Release publiée. Pour reconstruire une version déjà publiée, lancez **Actions → Build Windows EXE (code signing ready) → Run workflow** et renseignez `release_tag` (par exemple `v2.0.1`).


## TCG Stream Tool v2.0.1

- Version de référence : `package.json`. Le script `npm run sync-version` synchronise la version Tauri et Cargo avant la compilation.
- Scanner hybride : tentative d'identification visuelle via le service du jeu sélectionné, puis repli sur l'OCR local lorsque le service est indisponible. La reconnaissance n'est pas garantie pour tous les jeux ni toutes les éditions.
- Thèmes disponibles : Cyber Neon, Obsidian Gold, Arcade Violet et Emerald Stream. Le thème est mémorisé localement.
- L'identification visuelle distante envoie une capture de la carte au service de scan externe ; utiliser l'OCR local n'implique pas l'envoi de cette image si le service distant n'est pas sollicité.
