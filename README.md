# stock-mobile

Application mobile Expo / React Native pour PantryFlow, connectee a `stock-api`.

## Prerequis

- Node.js 22.13+ (branche 22), 24.3+ (branche 24), ou 26+
- npm 10+
- Expo Go compatible SDK 58 (device) ou emulateur Android/iOS

## Configuration locale

1. Copier le fichier d'environnement:

```powershell
Copy-Item .env.example .env
```

2. Adapter `EXPO_PUBLIC_API_BASE_URL` dans `.env` selon ton contexte:

- `http://localhost:8080` depuis un navigateur desktop,
- `http://10.0.2.2:8080` depuis emulateur Android,
- IP LAN de ta machine depuis device physique.

3. Verifier aussi la redirection OAuth2 mobile:

- `EXPO_PUBLIC_OAUTH_REDIRECT_URI=stockshop://oauth2/callback`

## Commandes utiles

```powershell
npm install
npm run start
npm run typecheck
npm run lint
npm run check:contrast
```

Apres une mise a jour du SDK Expo, arreter le serveur Metro existant et le
relancer en vidant son cache:

```powershell
npm run start -- --clear
```

Le SDK du projet et celui pris en charge par Expo Go doivent correspondre.

## Generation du client API

Le client est genere depuis l'OpenAPI de `stock-api` via Orval.

```powershell
$env:ORVAL_OPENAPI_URL="http://localhost:8080/v3/api-docs"
npm run api:generate
```

Sortie cible: `src/services/api/generated`.
