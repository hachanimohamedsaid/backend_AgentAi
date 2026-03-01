#!/bin/bash
# Réécrit l'historique pour supprimer la clé OpenAI du commit 52b8833.
# À lancer à la racine du repo (ou depuis n'importe où dans le repo).

set -e
cd "$(git rev-parse --show-toplevel)"

BAD_COMMIT="52b8833c54994e9dbc4a1cca1edffd6d1dd453fd"

echo "=== 1. Démarrage du rebase (commit 52b8833 marqué en 'edit') ==="
export GIT_SEQUENCE_EDITOR="sed -i '' 's/^pick 52b8833/edit 52b8833/'"
git rebase -i "${BAD_COMMIT}^"

echo ""
echo "=== 2. Remplacement de la clé dans .env.example (commit en cours) ==="
if [ ! -f .env.example ]; then
  echo "Erreur: .env.example introuvable."
  exit 1
fi
sed -i '' 's/^OPENAI_API_KEY=.*/OPENAI_API_KEY=your-openai-api-key-here/' .env.example
grep OPENAI .env.example

echo ""
echo "=== 3. Amend du commit et poursuite du rebase ==="
git add .env.example
git commit --amend --no-edit
GIT_EDITOR=true git rebase --continue || true

echo ""
echo "=== Terminé. Lance: git push --force-with-lease origin main ==="
