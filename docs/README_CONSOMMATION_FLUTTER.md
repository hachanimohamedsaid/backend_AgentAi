# Document Flutter – Consommation de l’API

## Document de référence

**Le document principal pour consommer l’API backend depuis Flutter est :**

**[DOCUMENTATION_CONSOMMATION_FLUTTER.md](./DOCUMENTATION_CONSOMMATION_FLUTTER.md)**

Ce fichier contient tout ce dont tu as besoin pour connecter ton app Flutter au backend NestJS.

---

## Contenu du document

| Section | Contenu |
|--------|--------|
| **1. Configuration** | Base URL (dev / prod), headers |
| **2. Modèles Dart** | `UserModel`, `ProfileModel`, `AuthResponse` avec exemples de code |
| **3. Endpoints** | Inscription, connexion, reset password, Google, Apple, **GET /auth/me**, **PATCH /auth/me**, **POST /auth/change-password**, health – avec exemples Dart pour chaque appel |
| **4. Gestion des erreurs** | `_parseError`, codes 400 / 401 / 409 |
| **5. Stockage du token** | SharedPreferences (ou secure storage) après login |
| **6. Flux Profile et Edit Profile** | Chargement du profil, pré-remplissage, sauvegarde (dont téléphone) |
| **7. Récapitulatif des routes** | Tableau de toutes les routes (méthode, URL, body / header) |
| **8. Dépendances et environnements** | `http`, `shared_preferences`, URLs selon l’environnement |
| **9. Page Change Password** | Formulaire dynamique : validation en temps réel + appel POST /auth/change-password |

---

## Base URL

- **Développement** : `http://localhost:3000`
- **Émulateur Android** : `http://10.0.2.2:3000`
- **Production** : `https://ton-backend.up.railway.app`

---

## Routes principales

| Action | Méthode | Route |
|--------|--------|-------|
| Inscription | POST | `/auth/register` |
| Connexion | POST | `/auth/login` ou `/auth/signin` |
| Profil (données dynamiques) | GET | `/auth/me` (Header: `Authorization: Bearer <token>`) |
| Mise à jour profil | PATCH | `/auth/me` |
| Changer le mot de passe | POST | `/auth/change-password` |
| Reset password (demande) | POST | `/auth/reset-password` |
| Nouveau MDP (lien email) | POST | `/auth/reset-password/confirm` |
| Connexion Google | POST | `/auth/google` |
| Connexion Apple | POST | `/auth/apple` |

---

## Autres documents utiles

- **[API_CONTRACT_FLUTTER.md](./API_CONTRACT_FLUTTER.md)** – Contrat API (réponses, erreurs) sans exemples Dart.
- **[CORRECTION_PROFILE_FLUTTER.md](./CORRECTION_PROFILE_FLUTTER.md)** – Pourquoi la page Profile affiche des données statiques et comment corriger (GET /auth/me + affichage dynamique).

---

*Pour implémenter la consommation de l’API dans ton projet Flutter, ouvre **DOCUMENTATION_CONSOMMATION_FLUTTER.md** et suis les sections 1 à 9.*
