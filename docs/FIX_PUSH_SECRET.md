# Corriger le push bloqué (secret dans l’historique Git)

GitHub a bloqué le push car une clé API OpenAI a été détectée dans le commit `52b8833` (fichier `.env.example`).

## Étapes (à exécuter en local dans le repo)

### 1. Réécrire le commit qui contient le secret

Tu dois modifier le commit `52b8833` pour que `.env.example` y contienne un placeholder au lieu de la clé.

```bash
# Lancer une rebase interactive à partir du commit juste avant 52b8833
git rebase -i 52b8833^
```

Dans l’éditeur qui s’ouvre :
- Repère la ligne qui commence par `pick 52b8833`
- Remplace `pick` par `edit` pour ce commit
- Enregistre et quitte

### 2. Remplacer la clé dans ce commit

Quand le rebase s’arrête sur le commit 52b8833 :

```bash
# Remplacer la ligne OPENAI_API_KEY par un placeholder (macOS)
sed -i '' 's/^OPENAI_API_KEY=.*/OPENAI_API_KEY=your-openai-api-key-here/' .env.example

# Ou ouvre .env.example à la main et mets : OPENAI_API_KEY=your-openai-api-key-here
```

Puis :

```bash
git add .env.example
git commit --amend --no-edit
git rebase --continue
```

(Si l’éditeur s’ouvre pour un message, enregistre et quitte.)

### 3. Pousser l’historique réécrit

```bash
git push --force-with-lease origin main
```

---

## Après le fix

1. **Révoque la clé OpenAI** exposée sur [platform.openai.com/api-keys](https://platform.openai.com/api-keys) et crée une nouvelle clé.
2. Mets la **nouvelle** clé uniquement dans ton `.env` local et dans les Variables Railway, jamais dans le dépôt.
