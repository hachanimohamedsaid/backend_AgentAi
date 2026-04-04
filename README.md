<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

### MongoDB Atlas & environment

1. Copy `.env.example` to `.env` and set `MONGO_URI` to your MongoDB Atlas connection string.
2. **Local:** Ensure `.env` is in the project root. It is loaded via `@nestjs/config`.
3. **Railway:** Add `MONGO_URI` (and optionally `PORT`) in your project's **Variables** tab. The app uses `process.env.PORT` when provided.
4. On startup you should see `[Mongoose] Successfully connected to MongoDB Atlas.` and `[App] NestJS server listening on port ...`.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Vérifier que tout fonctionne

**Méthode de test complète :** voir [docs/TEST_COMPLET.md](docs/TEST_COMPLET.md) pour la procédure détaillée (local + prod + checklist).

### Guides Auth (Railway)

- Google Sign-In backend: [docs/NESTJS_GOOGLE_AUTH_RAILWAY_SETUP.md](docs/NESTJS_GOOGLE_AUTH_RAILWAY_SETUP.md)
- Apple Sign-In backend: [docs/NESTJS_APPLE_SIGNIN_RAILWAY_SETUP.md](docs/NESTJS_APPLE_SIGNIN_RAILWAY_SETUP.md)

### 1. Variables d'environnement

```bash
cp .env.example .env
# Éditer .env : MONGO_URI (obligatoire), optionnellement ML_SERVICE_URL, JWT_SECRET, etc.
```

Vérifier que les variables requises sont définies :

```bash
npm run verify:env
```

### 2. Service ML (FastAPI)

Le service ML exige `MONGO_URI` ou `MONGODB_URI` (MongoDB hébergé, ex. Atlas).

```bash
cd ml_service
export MONGO_URI="mongodb+srv://..."   # ou depuis .env à la racine
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5001
```

Dans un autre terminal, tester l’API de prédiction :

```bash
curl -s -X POST http://127.0.0.1:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"timeOfDay":10,"dayOfWeek":1,"suggestionType":"coffee"}' \
  | jq .
# Attendu : {"probability": 0.5} (ou une valeur entre 0.1 et 0.9)
```

Ou utiliser le script :

```bash
npm run verify:ml
```

### 3. Backend Nest

```bash
npm run start:dev
```

Vérifier dans les logs : `[Mongoose] Successfully connected to MongoDB Atlas.` et `Nest application successfully started`.

Tester l’API :

```bash
curl -s http://localhost:3000/
# Attendu : Hello World!
```

### 4. Intégration Backend → ML

Si `ML_SERVICE_URL` est défini (ou en local si le service ML tourne sur le port 5001), les endpoints qui utilisent les prédictions ML fonctionnent. Sinon, les appels ML échouent (vérifier les logs Nest).

### 5. Résumé des commandes de vérification

| Commande        | Rôle                                      |
|-----------------|--------------------------------------------|
| `npm run verify:env` | Vérifie que MONGO_URI est défini          |
| `npm run verify:ml`      | Teste POST /predict sur le service ML (port 5001) |
| `npm run verify:backend` | Teste GET / sur le backend Nest (port 3000)      |
| `npm run verify:all`     | Enchaîne verify:env, verify:ml, verify:backend (ML et Nest doivent être lancés) |
| `npm run test`           | Tests unitaires Nest                              |
| `npm run test:e2e`       | Tests e2e (nécessite MONGO_URI dans .env)         |

## Observability locale (Prometheus, Loki, Grafana, Alertmanager)

### Démarrer la stack

1. Démarrer le backend NestJS sur le port 3000:

```bash
npm run start:dev
```

2. Démarrer la stack observability:

```bash
docker compose -f docker-compose.observability.yml up -d
```

### Endpoints utiles

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)
- Loki: http://localhost:3100/ready
- Alertmanager: http://localhost:9093
- Backend metrics: http://localhost:3000/metrics

### Vérifications rapides

```bash
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:3000/metrics | head -30
curl -s http://localhost:9090/api/v1/targets | jq .
```

### Arrêter la stack

```bash
docker compose -f docker-compose.observability.yml down
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
