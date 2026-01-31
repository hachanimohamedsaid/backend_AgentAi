# Variables d'environnement à ajouter sur Railway

Dans le dashboard **Railway** : ton projet → onglet **Variables** (ou **Settings** → **Variables**). Ajoute les variables suivantes.

---

## Obligatoires (pour que l'app fonctionne)

| Variable | Exemple / Description |
|----------|------------------------|
| **MONGO_URI** | `mongodb+srv://user:password@cluster.xxxxx.mongodb.net/pidevagentai?retryWrites=true&w=majority&appName=Cluster0` |
| **JWT_SECRET** | Une chaîne secrète forte (ex. générée aléatoirement), différente en production |

---

## Optionnelles mais recommandées

| Variable | Exemple / Description |
|----------|------------------------|
| **GOOGLE_CLIENT_ID** | `1089118476895-i9cgjpn49347f6rrtgi1t27ehttb3oh6.apps.googleusercontent.com` — pour que **POST /auth/google** fonctionne |
| **JWT_EXPIRES_IN** | `7d` (durée de validité du token JWT) |

---

## Optionnelles (selon les fonctionnalités)

| Variable | Exemple / Description |
|----------|------------------------|
| **APPLE_CLIENT_ID** | Ton Service ID Apple — pour **POST /auth/apple** |
| **SENDGRID_API_KEY** | `SG.xxxx...` — pour l’envoi de l’email de réinitialisation de mot de passe |
| **SENDGRID_FROM_EMAIL** | `noreply@ton-domaine.com` — adresse expéditrice (vérifiée dans SendGrid) |
| **RESET_LINK_BASE_URL** | `https://ton-app.com/reset-password` — URL de la page "Reset Password" (lien dans l’email) |
| **PORT** | Souvent défini automatiquement par Railway ; ne pas mettre si Railway le fournit déjà |

---

## Résumé : quoi ajouter dans Railway

1. **MONGO_URI** — même valeur que dans ton `.env` local (chaîne de connexion MongoDB Atlas).
2. **JWT_SECRET** — une clé secrète forte pour la production (différente de celle en local).
3. **GOOGLE_CLIENT_ID** — ton Client ID Google OAuth :  
   `1089118476895-i9cgjpn49347f6rrtgi1t27ehttb3oh6.apps.googleusercontent.com`

Les autres (Apple, SendGrid, RESET_LINK_BASE_URL, JWT_EXPIRES_IN, PORT) selon tes besoins.

---

*Après avoir ajouté les variables, Railway redéploie automatiquement. Vérifie les logs en cas d’erreur au démarrage.*
