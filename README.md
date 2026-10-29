# TCG STREAM TOOL

Application Windows TCG STREAM TOOL par **Reddice Geek**.

## Génération automatique du `.exe`

GitHub Actions compile l'application automatiquement :

- à chaque push sur `main` ou `master` : ouvrez **Actions**, puis le workflow **Build Windows EXE** et téléchargez l'artefact `TCG-STREAM-TOOL-Windows-EXE` ;
- pour publier une version dans **Releases** : mettez à jour les numéros de version dans `package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`, créez un tag (par exemple `v1.0.15`) et poussez-le :

```bash
git tag v1.0.15
git push origin v1.0.15
```

Le workflow compile alors l'installateur Windows `.exe` et le joint à la Release GitHub. Il n'exige pas de secret de signature Tauri pour compiler l'installateur.

## Détection des cartes

Le scan manuel tente d'abord la reconnaissance visuelle à partir du catalogue distant pris en charge. Si le service échoue ou ne renvoie pas de résultat suffisamment exploitable, le scanner revient à l'OCR local. La qualité dépend notamment de l'éclairage, de l'angle, de la mise au point et de la carte choisie. Le scan automatique reste local pour éviter d'envoyer une image à un service distant à chaque cycle.

## Avertissement Microsoft Defender SmartScreen

Le build automatique ne rend pas automatiquement l'éditeur « reconnu ». Tant que le fichier `.exe` n'est pas signé avec un certificat de signature de code reconnu, Windows peut afficher « Windows a protégé votre ordinateur » ou « éditeur inconnu ». Pour faire disparaître durablement cet avertissement, il faut signer l'application avec un certificat adapté et protéger la clé de signature dans les secrets GitHub. Ne désactivez pas Defender pour installer une application dont la provenance n'est pas vérifiée.

Les utilisateurs n'ont pas besoin d'installer Node.js, Rust, Tauri ou Git.
