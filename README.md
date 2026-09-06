# stock-mobile

Application mobile Expo / React Native pour PantryFlow, connectee a `stock-api`.

## Prerequis

- Node.js 20+
- npm 10+
- Expo Go (device) ou emulateur Android/iOS

## Configuration locale

1. Copier le fichier d'environnement:

```powershell
Copy-Item .env.example .env
```

2. Adapter `EXPO_PUBLIC_API_BASE_URL` dans `.env` selon ton contexte:

- `http://localhost:8080` depuis un navigateur desktop,
- `http://10.0.2.2:8080` depuis emulateur Android,
- IP LAN de ta machine depuis device physique.

## Commandes utiles

```powershell
npm install
npm run start
npm run typecheck
npm run lint
```

## Generation du client API

Le client est genere depuis l'OpenAPI de `stock-api` via Orval.

```powershell
$env:ORVAL_OPENAPI_URL="http://localhost:8080/v3/api-docs"
npm run api:generate
```

Sortie cible: `src/services/api/generated`.
