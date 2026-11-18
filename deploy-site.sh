#!/usr/bin/env bash
# Mise en production du site Dancing! (dossier site/) sur le VPS, sans toucher aux autres sites.
#   sudo bash /opt/dancing/deploy-site.sh [dossier_du_site]
# Par défaut : /var/www/dancing.click. Le script :
#   - récupère la dernière version de main (dossier site/ seulement) ;
#   - refuse tout dossier cible dangereux ou partagé (/, /var/www, /etc, /home…) ;
#   - sauvegarde la version en ligne dans /var/backups/dancing-site (3 dernières gardées) ;
#   - copie site/ dans le dossier cible (copie miroir limitée à ce dossier) ;
#   - ne modifie ni Nginx ni aucun autre dossier.
# Retour en arrière : sudo bash /opt/dancing/deploy-site.sh --rollback
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
TARGET="/var/www/dancing.click"
BACKUPS="/var/backups/dancing-site"
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --rollback) ROLLBACK=1 ;;
    *) TARGET="$arg" ;;
  esac
done
TARGET="$(realpath -m "$TARGET")"

# Garde-fous : le dossier cible doit être propre à ce site.
case "$TARGET" in
  /|/var|/var/www|/var/www/html|/etc|/etc/*|/home|/root|/usr|/usr/*|/opt|"$REPO"|"$REPO"/*)
    echo "Refusé : $TARGET n'est pas un dossier dédié au site." >&2; exit 1 ;;
esac
if [[ "$(basename "$TARGET")" != *dancing* ]]; then
  echo "Refusé : le dossier cible doit contenir « dancing » dans son nom ($TARGET)." >&2; exit 1
fi

mkdir -p "$BACKUPS"

# Copie miroir d’un dossier dans un autre (rsync si présent, sinon tar) ; ne touche qu’au dossier de destination.
mirror() {
  local src="$1" dst="$2"; mkdir -p "$dst"
  if command -v rsync >/dev/null; then rsync -a --delete --exclude '.git' "$src/" "$dst/"
  else find "$dst" -mindepth 1 -delete; (cd "$src" && tar --exclude .git -cf - .) | (cd "$dst" && tar -xf -); fi
}

if [[ $ROLLBACK == 1 ]]; then
  LAST="$(ls -1d "$BACKUPS"/*/ 2>/dev/null | sort | tail -n 1 || true)"
  [[ -n "$LAST" ]] || { echo "Aucune sauvegarde dans $BACKUPS." >&2; exit 1; }
  mirror "${LAST%/}" "$TARGET"
  echo "Retour à la version sauvegardée : $LAST"
  exit 0
fi

echo "› Récupération de la dernière version…"
git -C "$REPO" fetch --quiet origin main
git -C "$REPO" reset --quiet --hard origin/main
[[ -f "$REPO/site/index.html" ]] || { echo "site/index.html introuvable dans $REPO." >&2; exit 1; }

if [[ -d "$TARGET" && -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
  STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
  echo "› Sauvegarde de la version en ligne : $BACKUPS/$STAMP"
  mirror "$TARGET" "$BACKUPS/$STAMP"
  ls -1d "$BACKUPS"/*/ | sort | head -n -3 | xargs -r rm -rf
fi

echo "› Copie de site/ vers $TARGET"
mirror "$REPO/site" "$TARGET"
# lisible par le serveur web, sans changer le propriétaire des autres dossiers
find "$TARGET" -type d -exec chmod 755 {} + && find "$TARGET" -type f -exec chmod 644 {} +

echo "✓ Site en ligne ($(git -C "$REPO" log -1 --format='%h · %s'))"
