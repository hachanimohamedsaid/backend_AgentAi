# Stripe Checkout (abonnements) – Backend NestJS

Ce document explique la configuration backend nécessaire pour que l’app Flutter ouvre Stripe Checkout après le choix du plan **mensuel** ou **annuel**.

## 1. Variables d’environnement Stripe

Dans Railway ou `.env` du backend, ajoute :

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
STRIPE_SUCCESS_URL=https://ton-domaine.com/stripe/success?plan={PLAN}
STRIPE_CANCEL_URL=https://ton-domaine.com/stripe/cancel
```

- `STRIPE_SECRET_KEY` : clé secrète Stripe (`sk_test_...` ou `sk_live_...`). Ne jamais la mettre dans Flutter.
- `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` : IDs `price_...` des abonnements récurrents.
- `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` : URLs de retour valides HTTP(S).

## 2. Contraintes importantes

- `success_url` et `cancel_url` envoyés à Stripe doivent être des URLs `http://` ou `https://` valides.
- Stripe ne prendra pas directement une URL `piagent://...` ou `piagent:///...` dans `checkout.sessions.create()`.
- Pour un retour automatique dans l’app, la page HTTP(S) de succès doit rediriger vers le deep link de l’app.

Exemple de redirection côté backend :

```ts
// controller Stripe redirect
@Get('stripe/success')
success(@Query('plan') plan: string) {
  return `<!DOCTYPE html><html><body><script>window.location.href = 'piagent:///subscription/success?plan=${encodeURIComponent(plan)}'</script></body></html>`;
}
```

## 3. Endpoint backend attendu

- `POST /billing/create-checkout-session`
- Reçoit un body JSON : `{ "plan": "monthly" }` ou `{ "plan": "yearly" }`
- Doit être protégé par JWT
- Doit renvoyer :

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_..." }
```

## 4. Exemples de configuration

`STRIPE_SUCCESS_URL=https://ton-domaine.com/stripe/success?plan={PLAN}`

`STRIPE_CANCEL_URL=https://ton-domaine.com/stripe/cancel`

## 5. À documenter côté backend

- Variables Stripe à ajouter dans Railway : `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`
- Le backend gère Stripe Checkout en mode abonnement
- Le `success_url` passe par une URL HTTPS valide
- Le frontend ouvre Stripe via un navigateur externe
- La page de succès HTTP(S) peut ensuite rediriger vers l’app via `piagent:///...`
