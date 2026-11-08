# Dancing! — danser × overlay

Double-clic sur **Lancer Replay HUD.cmd** (ou le raccourci « Replay HUD 2 » du Bureau) : l'interface s'ouvre sur http://127.0.0.1:24070.

1. Dépose un `.osr` (ou choisis-le dans la liste : dossier Replays d'osu! et replays déposés).
2. Règle l'essentiel (résolution, FPS, encodeur, skin, volumes, fond…). Tous les réglages danser sont dans « Réglages danser ».
3. **Aperçu 12 s** pour vérifier, puis **Lancer le rendu**. La vidéo finale arrive dans `videos/` et se lit dans l'interface.

## Comment ça marche

- `../../danser-hud` est danser-go 0.11.0 modifié : quand la variable `DANSER_HUD_EXPORT` est définie, il écrit pendant l'enregistrement un JSON avec chaque jugement (score, combo, pp, pp si FC, étoiles en direct, UR, erreur de frappe), chaque appui de touche, le classement en ligne, les strains et le temps de map de chaque image. Sans cette variable, danser se comporte normalement.
- `compose.mjs` redessine l'overlay image par image à partir de cet export (même horloge que la vidéo, donc synchronisé à l'image près) et le fusionne avec la vidéo danser via ffmpeg.
- `web/hud.js` est le moteur de dessin unique : rendu vidéo, aperçu de l'interface et overlay tosu en direct.
- danser ne dessine pas ses propres éléments que l'overlay remplace (score, combo, pp, barre d'erreur, touches, classement, graphe) : ils sont verrouillés dans « Réglages danser ».

## Scènes, vie, flou, couleurs

- **Barre de vie** : le bandeau du haut se vide par les extrémités selon la vie (exportée par danser à chaque image) et clignote en rouge quand elle est basse. La barre de vie du skin est désactivée.
- **Intro / fin** (onglet Scènes) : carte animée de la map et du joueur, puis écran de résultats animé. La musique de la map (extrait décodé par danser en WAV) passe dessous, mixée avec le son PCM que danser écrit pendant l'enregistrement (le ffmpeg fourni avec danser ne sait décoder ni MP3 ni AAC).
- **Flou de mouvement** : préréglages ×4 / ×8 / ×14 calculés par danser sur GPU ; l'overlay est ajouté après, il reste net.
- **Couleurs** : cercles (skin, map, perso, arc-en-ciel), sliders, curseur, et chaque élément de l'overlay.

## Presets, éditeur et widgets tosu

- 5 presets intégrés (Référence, Néon, Minimal, Tournoi, Lazer) + tes presets (onglet Presets → « Enregistrer comme preset »), stockés dans `data/presets.json`.
- « Éditer la disposition » sur l'aperçu : glisse chaque widget, molette = taille ; propriétés dans l'onglet Presets.
- « Ajouter un widget tosu » : catalogue officiel tosu (tosu.app), installation dans `tosu/static`, placement libre. Dans l'aperçu et dans la vidéo, les widgets tournent sur les données du replay : `web/tosu-shim.js` remplace leur connexion WebSocket (v1, v2, precise, commands) et pilote leur horloge ; `web/tosu-emu.js` produit les messages au format exact de tosu ; à l'export, Edge (sans fenêtre) rend `web/stage.html` image par image.

## Compte osu!, mises à jour, application

- Onglet Plus → Compte osu! : ID client + clé secrète d'une application OAuth osu! (testés puis écrits dans `danser-hud/settings/credentials.json`). Classement personnalisable (taille, joueurs masqués, joueurs ajoutés à la main).
- Mises à jour : vérification au démarrage puis toutes les 6 h. tosu : remplacement de `tosu.exe` (copie `.bak`). danser : sources de la nouvelle version + `patch/danser-hud.patch` (export HUD) + compilation (`build/build-core.ps1 -Src … -Online`), puis binaires officiels ; l'ancien dossier est sauvegardé.
- Application native : `Replay HUD.exe` (Tauri, sources dans `app/`) démarre le serveur sans fenêtre, joue l'animation de démarrage et l'arrête à la fermeture.

## Overlay en direct (tosu)

Page « Overlay en direct » → *Installer dans tosu*. L'overlay apparaît dans tosu sous « Replay HUD 2 » (source OBS 1920×1080).

## Fichiers

- `data/settings.json` : tes réglages (overlay + surcharges danser + rendu).
- `data/replays/` : replays déposés. `data/work/` : fichiers intermédiaires (supprimés après rendu).
- Sources Go modifiées : `../build/src` (`app/states/components/overlays/hudexport.go` + quelques appels). Recompiler : `../build/build-core.ps1`, puis copier `../build/danser-core-hud.dll` en `danser-hud/danser-core.dll`. L'ancienne DLL est sauvegardée en `danser-core-1.1.backup.dll`.

Dépendances : Node.js, `@napi-rs/canvas` (dessin), `@fontsource/nunito` (police OFL de l'overlay).
## Édition portable Windows

Depuis `v2`, exécuter `./build-portable.ps1` puis ouvrir `dist/Dancing!/Dancing!.exe`.
Garder le dossier entier. L’éditeur utilise les contrôles Windows Forms. Le dossier
contient Node.js, danser-hud, tosu et Chromium Headless Shell. Ce dernier sert à
capturer les widgets HTML du catalogue en arrière-plan. La résolution vidéo se règle
dans l’onglet **Rendu**. Les beatmaps des replays doivent être accessibles à danser.
La fenêtre reprend la disposition en trois colonnes, l’aperçu 16:9, les commandes
sous l’aperçu et les cartes de presets de l’interface sauvegardée.

Au premier lancement, **Configuration** permet de vérifier les dossiers osu!
détectés, d’en choisir d’autres et de régler la résolution. Le bouton reste
accessible dans la barre du haut.

**Bibliothèque** sépare le catalogue communautaire tosu et les widgets téléchargés.
Télécharge un widget tosu, puis clique sur **Ajouter au montage**.
Dans **Montage**, les quatre presets Dancing! chargent des compositions avec
des widgets intégrés. **Référence** charge le preset CPOL.
Un widget sélectionné se retire avec **Retirer du montage**, le clic droit ou
la touche **Suppr**. Pour le direct, utiliser **Démarrer tosu (OBS)**.
Après un rendu lancé dans Dancing!, l’aperçu Jeu utilise des images échantillonnées
du dernier enregistrement danser. Les images restent disponibles pendant la session.
Les exports se lisent directement dans l’onglet **Vidéos** avec les commandes
Lecture, Pause et la barre de position. **Tester 12 s** ouvre le lecteur après le
rendu. Le lecteur Windows lit les formats pris en charge par les codecs du poste.

Le script prend danser-hud (avec son export Replay HUD) et tosu dans les dossiers
voisins du dépôt. Sources amont et licences :
[danser-go](https://github.com/Wieku/danser-go) et
[tosu](https://github.com/tosuapp/tosu) ([LGPL-3.0](https://github.com/tosuapp/tosu/blob/master/LICENSE)).
L’archive source du danser modifié accompagne ses binaires dans `runtime/danser-hud`.
Le compilateur C# de Windows construit l’interface. Le script attend
[Chromium Headless Shell pour Windows x64](https://googlechromelabs.github.io/chrome-for-testing/)
dans `app/headless/chrome-headless-shell-win64` ou dans le dossier passé à
`-ChromiumDirectory`.

