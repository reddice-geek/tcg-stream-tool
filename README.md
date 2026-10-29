# TCG Stream Tool

**TCG Stream Tool** est une application Windows gratuite développée par **Reddice Geek** pour aider les streameurs et créateurs de contenu à présenter des cartes de jeux de cartes à collectionner (TCG).

- **Dépôt officiel :** https://github.com/reddice-geek/tcg-stream-tool
- **Téléchargements :** https://github.com/reddice-geek/tcg-stream-tool/releases
- **Contact :** reddice.geek@gmail.com

## Télécharger et installer

1. Ouvrez la page [Releases](https://github.com/reddice-geek/tcg-stream-tool/releases).
2. Ouvrez la version publiée et téléchargez l'installateur Windows `.exe` dans **Assets**.
3. Lancez l'installateur et lisez la `CHARTE_LEGALE.txt`.
4. Si Windows affiche un avertissement, vérifiez la provenance du fichier et le résultat du workflow GitHub avant de continuer. Ne désactivez pas Microsoft Defender pour un fichier dont la provenance n'est pas vérifiée.

Les utilisateurs n'ont normalement pas besoin d'installer Node.js, Rust, Tauri ou Git pour utiliser l'installateur publié.

## Jeux TCG ciblés

Selon les fonctionnalités et catalogues disponibles, le projet vise notamment Naruto Mythos, Magic: The Gathering, Yu-Gi-Oh!, Pokémon, One Piece Card Game, Dragon Ball, Digimon, Disney Lorcana et d'autres jeux compatibles. La prise en charge et la précision peuvent varier selon le jeu et la source de données.

## Génération automatique du `.exe`

Le workflow **Build Windows EXE** se lance :
- à chaque push sur `main` ou `master` ;
- lorsqu'une **GitHub Release est publiée** ;
- manuellement depuis l'onglet **Actions** avec **Run workflow**.

### Quand une Release est publiée

1. Créez une Release dans l'onglet **Releases** et publiez-la.
2. Ouvrez **Actions** puis le workflow **Build Windows EXE**.
3. Attendez que l'exécution se termine avec succès (coche verte).
4. Le workflow compile l'installateur et l'ajoute aux **Assets** de cette Release. Il produit aussi un artefact téléchargeable depuis l'exécution Actions.

Si le build échoue, aucun installateur valide ne sera joint : ouvrez l'exécution en échec et consultez la première étape rouge ainsi que ses logs.

### Construire sans publier une Release

Après un push sur `main` ou `master`, ouvrez **Actions** et téléchargez l'artefact `TCG-STREAM-TOOL-Windows-EXE` une fois le workflow terminé. Vous pouvez aussi lancer le workflow manuellement.

Avant de publier une version, assurez-vous que la version est cohérente dans :
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

## Reconnaissance des cartes

La reconnaissance assistée peut être affectée par l'éclairage, l'angle, la mise au point, l'état de la carte et la disponibilité des catalogues. Les résultats doivent être vérifiés avant d'être considérés comme certains.

Selon la version et le mode de scan, une recherche peut utiliser un service distant ou un catalogue/API tiers. Consultez la charte légale et la documentation du code pour les détails de la version installée ; les services tiers appliquent leurs propres conditions et politiques de confidentialité.

## Microsoft Defender SmartScreen

La compilation automatique ne signe pas automatiquement l'application. Windows peut afficher « éditeur inconnu » si le programme n'a pas de signature numérique reconnue ou si sa réputation est insuffisante. Téléchargez uniquement depuis le dépôt officiel et vérifiez les résultats du build. Ne désactivez pas les protections de Windows pour contourner un avertissement.

## Licence et usage autorisé

TCG Stream Tool est distribué gratuitement par Reddice Geek. Sauf autorisation écrite préalable, la charte prévoit un usage personnel ou de création de contenu **non rémunéré**. Les streams monétisés, sponsorisés ou rémunérés nécessitent une autorisation préalable. Consultez [`CHARTE_LEGALE.txt`](CHARTE_LEGALE.txt).

Les marques, illustrations et noms des jeux appartiennent à leurs détenteurs respectifs. Sauf indication contraire, Reddice Geek et TCG Stream Tool ne sont pas affiliés aux éditeurs de ces jeux.

## Signaler un bug

Ouvrez une [issue GitHub](https://github.com/reddice-geek/tcg-stream-tool/issues) en indiquant la version, Windows utilisé, le TCG concerné, le résultat obtenu et les étapes pour reproduire le problème. N'incluez pas de données personnelles ou confidentielles.
