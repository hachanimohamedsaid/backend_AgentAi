# Email de vérification / reset non reçu – Dépannage Resend

Si l’app affiche « Un email avec un lien de vérification vous a été envoyé » mais que le mail n’arrive pas, vérifier les points suivants.

---

## 1. Backend : RESEND_API_KEY

- **Railway / production** : dans les variables du service, vérifier que **RESEND_API_KEY** est bien défini (clé commençant par `re_`).
- Si la clé est absente, le backend renvoie maintenant une erreur **503** au lieu d’afficher un succès. Vérifier les logs Railway : `[Resend] RESEND_API_KEY is not set`.

---

## 2. Resend : domaine et expéditeur (EMAIL_FROM)

- Avec l’adresse par défaut **onboarding@resend.dev**, Resend en mode **development** n’envoie qu’à **l’adresse email du compte Resend**. Les autres adresses ne reçoivent pas le mail.
- Pour envoyer à **n’importe quelle adresse** :
  1. Aller sur [resend.com](https://resend.com) → **Domains**.
  2. Ajouter et vérifier **votre domaine** (DNS).
  3. Dans le backend, définir **EMAIL_FROM** avec une adresse sur ce domaine (ex. `noreply@votredomaine.com`).

---

## 3. Spam / boîte de réception

- Vérifier le dossier **Spam / Courrier indésirable**.
- Si vous utilisez Gmail/Outlook, vérifier aussi **Promotions** ou **Autres**.

---

## 4. Erreur Resend (logs backend)

- Si l’envoi échoue (domaine non vérifié, quota, etc.), le backend renvoie maintenant **503** et enregistre l’erreur dans les logs.
- Sur **Railway** : onglet **Deployments** → sélectionner le déploiement → **View logs**. Chercher `[Resend] Verification email failed:` ou la réponse d’erreur Resend.
- Sur Resend : **Logs** dans le dashboard pour voir les envois refusés ou en erreur.

---

## 5. Checklist rapide

| Vérification | Où |
|--------------|-----|
| `RESEND_API_KEY` défini (prod / Railway) | Variables d’environnement du service |
| Domaine vérifié sur Resend (pour envoyer à tout le monde) | resend.com → Domains |
| `EMAIL_FROM` avec un expéditeur autorisé | `.env` / Railway |
| Logs backend en cas d’erreur | Railway logs, `[Resend]` |
| Boîte spam du destinataire | Côté utilisateur |

Une fois le domaine vérifié et `EMAIL_FROM` configuré sur ce domaine, les emails de vérification et de reset password devraient être reçus (hors blocage par le fournisseur mail).
