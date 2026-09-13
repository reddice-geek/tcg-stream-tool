# TCG STREAM TOOL

Application Windows TCG STREAM TOOL par **Reddice Geek**.

## Télécharger l'application

1. Ouvrez l'onglet **Releases** du dépôt GitHub.
2. Ouvrez la dernière version.
3. Dans **Assets**, téléchargez le fichier d'installation **`.exe`**.
4. Lancez l'installateur Windows.

Les utilisateurs n'ont pas besoin d'installer Node.js, Rust, Tauri ou Git.

## Publier une nouvelle version

La version de l'application est définie dans :

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Après avoir changé le numéro de version, créez et poussez un tag Git :

```bash
git tag v1.0.6
git push origin v1.0.6
```

Le workflow GitHub Actions **Build Windows EXE** compile alors automatiquement l'application et ajoute l'installateur `.exe` à une Release GitHub publique.

Le workflow peut aussi être lancé manuellement depuis **Actions > Build Windows EXE > Run workflow**.
