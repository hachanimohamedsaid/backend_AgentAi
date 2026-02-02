# Voix ChatGPT originale – OpenAI Realtime API (NestJS)

Ce document décrit le proxy WebSocket NestJS pour l’**API OpenAI Realtime** (voix ChatGPT originale). C’est la même voix que ChatGPT (pas du TTS, pas du Whisper, pas une imitation).

---

## 1. Prérequis

- Node.js 18+
- NestJS
- Clé API OpenAI (avec accès Realtime)
- Dépendances : `ws`, `@nestjs/websockets`, `@nestjs/platform-ws`

---

## 2. Variables d'environnement

Dans `.env` ou Railway → Variables :

```env
OPENAI_API_KEY=sk-xxxxxxxx
```

---

## 3. Implémentation

- **RealtimeVoiceService** (`src/realtime/realtime-voice.service.ts`) : proxy vers `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`. Une instance par connexion client. Méthodes : `connectToOpenAI(onAudioDelta, onTextDelta?)`, `sendAudioChunk(base64)`, `commitAndCreateResponse()`, `close()`.
- **RealtimeVoiceGateway** (`src/realtime/realtime.gateway.ts`) : WebSocket Gateway sur le path `/realtime-voice`. À chaque connexion client, crée un `RealtimeVoiceService` et le connecte à OpenAI ; relaie les messages audio (input → OpenAI, output → client).
- **RealtimeModule** : importé dans `AppModule`.
- **main.ts** : `app.useWebSocketAdapter(new WsAdapter(app))` pour utiliser la lib `ws` (WebSocket natif).

---

## 4. URL de connexion (Flutter)

L’app Flutter se connecte en WebSocket à :

- **Dev** : `ws://localhost:3000/realtime-voice`
- **Prod** : `wss://ton-backend.up.railway.app/realtime-voice`

Dans Flutter (`lib/core/config/api_config.dart`), définir `realtimeVoiceWsUrl` (ex. `ws://10.0.2.2:3000/realtime-voice` pour l’émulateur Android).

---

## 5. Protocole (client → serveur)

- **input_audio_buffer.append** : `{ "type": "input_audio_buffer.append", "audio": "<base64>" }` – envoi d’un chunk audio (PCM 24 kHz mono, base64).
- **input_audio_buffer.commit** : `{ "type": "input_audio_buffer.commit" }` – fin de prise de parole, déclenche la réponse OpenAI.

Le serveur relaie vers OpenAI et renvoie au client :

- **response.audio.delta** : `{ "type": "response.audio.delta", "delta": "<base64>" }` – chunk audio de la réponse.
- **response.output_text.delta** : `{ "type": "response.output_text.delta", "delta": "<text>" }` – texte de la réponse.
- **session.ready** : `{ "type": "session.ready" }` – envoyé une fois la connexion OpenAI établie.

---

## 6. Flutter – pipeline voix (résumé)

1. **Micro → PCM 24 kHz mono** : enregistrer avec `record` ou `flutter_sound` en sortie PCM 16-bit 24 kHz mono (ou convertir si besoin).
2. **Envoi** : pendant l’enregistrement, envoyer les chunks en base64 : `realtimeClient.sendAudioChunk(base64Encode(pcmChunk))`.
3. **Fin de prise de parole** : appeler `realtimeClient.commitAndCreateResponse()`.
4. **Lecture** : s’abonner à `realtimeClient.audioDeltaStream`, décoder les bytes (PCM) et jouer avec `flutter_sound` (ex. `startPlayerFromStream` ou buffer + play).
5. **UI** : pendant l’envoi micro et la réception audio, mettre à jour `isSpeaking` / `isListening`.

---

## 7. Ce que ça donne

- Même voix que ChatGPT (alloy, Realtime).
- Comprend plusieurs langues et répond dans la même langue.
- Temps réel (streaming audio).
- Pas du TTS, pas du Whisper, pas une imitation.
