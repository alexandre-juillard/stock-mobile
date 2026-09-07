# Plan frontend mobile V1 - PantryFlow

Date de reference: 2026-09-06

## 1) Decisions validees

- Decoupage: par ecran (et non par sprint).
- UI: Option A (React Native Paper en priorite, composants custom seulement si necessaire).
- Offline V1: Option A (toutes les mutations passent par une file persistante).
- Home V1: l'ecran Stock est l'accueil principal (pas de dashboard separe).
- Barcode scan: reporte apres V1.

## 2) Objectif produit V1

Livrer une application mobile Expo/React Native qui couvre:

- Auth classique + OAuth2 Google mobile (code one-shot deja prevu cote API).
- Gestion stock (produits, quantites, seuils, expirations, categories).
- Gestion recettes (creation, edition, consultation, consommation).
- Gestion liste de courses (auto + manuel + finalisation).
- Profil / parametres / preferences notifications.
- Fonctionnement hors ligne operationnel avec synchro automatique au retour reseau.

## 3) Architecture cible (frontend)

```text
src/
  app/
    _layout.tsx
    index.tsx
    (auth)/
      _layout.tsx
      login.tsx
      register.tsx
      verify-email-pending.tsx
      forgot-password.tsx
      reset-password.tsx
      oauth2-link-confirmation.tsx
    (tabs)/
      _layout.tsx
      stock/index.tsx
      stock/[stockItemId].tsx
      stock/form.tsx
      categories/index.tsx
      recipes/index.tsx
      recipes/[recipeId].tsx
      recipes/form.tsx
      shopping-list/index.tsx
      profile/index.tsx
      profile/notifications.tsx
  services/
    api/
      generated/
      http-client.ts
      query-client.ts
    auth/
      auth-context.tsx
      token-storage.ts
    offline/
      mutation-queue.ts
      queue-persistence.ts
      queue-runner.ts
      connectivity.ts
  components/
    screens/
    forms/
    ui/
  utils/
    error-mapper.ts
    validation.ts
  constants/
    theme.ts
```

## 4) Strategie offline V1 (Option A - toutes mutations en file)

### 4.1 Principe

- Lecture: React Query + cache persistant AsyncStorage.
- Ecriture: toute mutation (POST/PUT/PATCH/DELETE) est enqueued localement puis executee:
  - immediatement si online,
  - differee si offline.
- Reconciliation: au succes mutation, invalidation fine des queries impactees.
- Robustesse: retries avec backoff, idempotency locale, gestion conflits metier.

### 4.2 Types de mutations a mettre en file

- Auth: refresh/logout hors file (temps reel), login/register online only.
- Stock: create, update quantity/threshold/expiration, delete, add-to-shopping-list.
- Products/Categories: create/update/delete, visibility, upload/delete photo.
- Recipes: create/update/delete, ingredients CRUD, consume (+ force).
- Shopping list: add/check/uncheck/delete/clear/finish/check-thresholds.
- Profile: update profile, locale, settings, avatar upload/delete.
- Push token: register/unregister.

### 4.3 Regles techniques

- Une mutation queued contient au minimum:
  - `id`, `createdAt`, `type`, `endpoint`, `method`, `payload`, `dependencies`, `retryCount`.
- Persist queue dans AsyncStorage (JSON versionne).
- FIFO par domaine + verrou global d'execution (pas de concurrence non controlee).
- Policy retry:
  - 4xx fonctionnel: stop + marquer `failed` (action utilisateur requise),
  - 5xx/network: retry auto avec backoff.
- Conflits metier:
  - `recipes/{id}/consume` peut renvoyer `409`: stock insuffisant/manquant.
  - Mutation reste en erreur metier, UI propose `force=true` ou correction manuelle.
- Upload image offline:
  - stocker URI locale + metadata en queue,
  - uploader quand online.

### 4.4 UX offline

- Badge global: `En ligne` / `Hors ligne`.
- Indicateur file: `N actions en attente`.
- Snackbar apres synchro: succes partiel / erreurs.
- Sur chaque ecran: afficher les changements optimistes + etat `en attente de synchro`.

## 5) Plan de livraison par ecran

Convention statuts:

- `[ ]` a faire
- `[-]` en cours
- `[x]` termine

### E00 - Fondations projet

**But:** remplacer le starter Expo et poser le socle commun.

- [x] Router: passer de `index/explore` template vers groupes `(auth)` et `(tabs)`.
- [x] Integrer React Native Paper (theme light/dark depuis `docs/screens.md`).
- [x] Installer dependances manquantes (react-query, secure-store, async-storage, paper, orval, zod, react-hook-form, netinfo).
- [x] Creer `query-client` + persistance cache queries.
- [x] Creer `http-client` (base URL, auth header, mapping erreurs API).
- [x] Ajouter `orval.config.ts` et script generation client.
- [x] Mettre a jour `README.md` mobile avec setup courant.

**DoD:** app demarre avec nouvelle navigation, provider global en place, theme applique.

### E01 - Connexion

**Route:** `src/app/(auth)/login.tsx`

**API:** `POST /api/auth/login`, `GET /api/auth/oauth2/google`, `GET /api/auth/oauth2/exchange`

- [x] Form email/password/rememberMe.
- [x] Login classique + stockage tokens SecureStore.
- [x] Bouton Google: ouverture navigateur systeme, deep link callback, exchange code.
- [x] Gestion cas `LINK_REQUIRED` (rediriger vers E06).
- [x] Gestion erreurs i18n API (`ApiError`).

**Offline:**

- Login online only (message clair si offline).
- Session existante conservee localement si deja connecte.

**DoD:** login classique + Google fonctionne sur device/emulateur.

Note verification: logique implementee et validee au typecheck/lint; test de parcours complet sur device/emulateur a confirmer.

### E02 - Inscription

**Route:** `src/app/(auth)/register.tsx`

**API:** `POST /api/auth/register`

- [x] Form prenom/nom/email/password.
- [x] Validation locale + erreurs backend.
- [x] Redirection vers E03 apres succes.

**Offline:**

- Mutation register queueable (optionnel) mais executee online a la reprise.
- UX: afficher `Inscription en attente` si soumise offline.

**DoD:** inscription cree un compte et affiche etat verification email.

Note verification: logique implementee et validee au typecheck/lint; test de parcours complet sur device/emulateur a confirmer.

### E03 - Verification email en attente

**Route:** `src/app/(auth)/verify-email-pending.tsx`

**API:** `POST /api/auth/resend-confirmation`

- [x] Ecran informatif + bouton renvoi email.
- [x] Cooldown UI anti-spam (client side).

**Offline:**

- [x] Renvoi confirmation passe par queue mutation.

**DoD:** renvoi email fonctionnel et feedback visible.

Note verification: logique implementee et validee au typecheck/lint; test de parcours complet sur device/emulateur a confirmer.

### E04 - Mot de passe oublie

**Route:** `src/app/(auth)/forgot-password.tsx`

**API:** `POST /api/auth/forgot-password`

- [x] Saisie email + confirmation visuelle.

**Offline:**

- [x] Mutation queueable avec feedback `en attente`.

**DoD:** flux de demande reset complet.

Note verification: logique implementee et validee au typecheck/lint; test de parcours complet sur device/emulateur a confirmer.

### E05 - Reset mot de passe

**Route:** `src/app/(auth)/reset-password.tsx`

**API:** `POST /api/auth/reset-password`

- [x] Lire `token` depuis deep link/email.
- [x] Saisie nouveau mot de passe + confirmation.

**Offline:**

- Preferer online only (token sensible et expirant).

**DoD:** reset valide puis retour login.

Note verification: logique implementee et validee au typecheck/lint; test de parcours complet sur device/emulateur a confirmer.

### E06 - Confirmation liaison compte Google

**Route:** `src/app/(auth)/oauth2-link-confirmation.tsx`

**API:** `POST /api/auth/oauth2/link-decision`

- [x] Ecran de choix `LINK` ou `DECLINE`.
- [x] Relancer emission tokens selon decision.

**Offline:**

- [x] Queueable, mais message explicite si decision en attente.

**DoD:** cas `LINK_REQUIRED` resolu sans blocage UX.

Note verification: logique implementee et validee au typecheck/lint; test de parcours complet sur device/emulateur a confirmer.

### E07 - Stock (liste) - accueil principal

**Route:** `src/app/(tabs)/stock/index.tsx`

**API:** `GET /api/stock-items`, `GET /api/stock-items/expiring-soon`

- [x] Liste produits, recherche locale, filtre categorie.
- [x] Badges statut expiration (`ok/low/expiring/expired`).
- [x] CTA ajout produit et acces detail.

**Filtre categorie (decision 2026-09-07) :** multi-selection (Option B) — plusieurs chips
categorie togglables simultanement, filtre cumulatif (union). Justifie par les categories
libres/illimitees crees par l'utilisateur (E10), plus adapte qu'un choix mono-selection des
que la liste de categories grandit.

**Offline:**

- Lecture depuis cache persistant.
- Etat stale assume + bouton `Rafraichir` quand online.

**DoD:** ecran utile offline avec dernier etat synchronise.

Note verification: logique implementee et validee au typecheck/lint; ecrans de detail (E08) et
formulaire (E09) crees en stub pour permettre la navigation typee, a completer dans leurs
etapes respectives.


### E08 - Detail produit du stock

**Route:** `src/app/(tabs)/stock/[stockItemId].tsx`

**API:** detail via `GET /api/stock-items` + mutations stock

- [x] Afficher quantite, unite, seuil, expiration, categorie, photo.
- [x] Actions: modifier quantite, marquer consomme (quantity 0 ou delete), ajouter courses.

**Offline:**

- [x] Toutes actions en queue avec update optimiste.

**DoD:** edition rapide fiable, y compris sans reseau.

Note verification: ecran detail implemente dans `src/app/(tabs)/stock/[stockItemId].tsx` avec
actions rapides offline-first (quantite, ajout courses, retire du stock), queue persistante dans
`src/services/offline/stock-item-actions-queue.ts`

### E09 - Ajout/edition produit en stock

**Route:** `src/app/(tabs)/stock/form.tsx`

**API:**

- `POST /api/products`, `PUT /api/products/{id}`
- `POST /api/stock-items`, `PATCH /api/stock-items/{id}/quantity|threshold|expiration`
- `POST /api/products/{id}/photo`

- [x] Form complet produit + stock.
- [x] Selection categorie, type quantite, unite.
- [x] Upload photo.

**Offline:**

- [x] Create/update/patch en queue.
- [x] Upload photo differe si offline.

**DoD:** creation/edition produit+stock en un flux clair.

Note verification: ecran formulaire implemente dans `src/app/(tabs)/stock/form.tsx` (create/edit,
selection categorie/type/unite, upload photo), queue persistante dediee dans
`src/services/offline/stock-form-submissions-queue.ts`, validations Zod dans
`src/utils/validation.ts`, puis verification OK via `npm run typecheck` et `npm run lint`.

### E10 - Gestion categories

**Route:** `src/app/(tabs)/categories/index.tsx`

**API:** `GET/POST/PUT/DELETE /api/categories`

- [ ] Liste categories.
- [ ] CRUD via dialogs Paper.

**Offline:**

- CRUD en queue + reconciliation des listes.

**DoD:** categories maintenables sans quitter l'ecran.

### E11 - Recettes (liste)

**Route:** `src/app/(tabs)/recipes/index.tsx`

**API:** `GET /api/recipes`

- [ ] Liste recettes + recherche.
- [ ] Tag `realisable avec mon stock` (derive via detail/stock).

**Offline:**

- Lecture cache + marqueur stale.

**DoD:** navigation rapide vers detail et creation.

### E12 - Detail recette

**Route:** `src/app/(tabs)/recipes/[recipeId].tsx`

**API:** `GET /api/recipes/{id}`, `POST /api/recipes/{id}/consume`, `DELETE /api/recipes/{id}`

- [ ] Ingredients dispo/non dispo.
- [ ] Action consommer recette.
- [ ] Si `409`: afficher conflict et proposer `force=true`.
- [ ] Action ajouter manquants aux courses (mapping via shopping list).

**Offline:**

- Consume/delete en queue.
- Si conflit au replay, mettre en erreur metier a corriger dans UI.

**DoD:** flux consommation complet et comprehensible.

### E13 - Creation/edition recette

**Route:** `src/app/(tabs)/recipes/form.tsx`

**API:**

- `POST /api/recipes`, `PUT /api/recipes/{id}`
- `POST/PUT/DELETE /api/recipes/{id}/ingredients/*`

- [ ] Nom recette.
- [ ] CRUD ingredients (produit, quantite, unite).

**Offline:**

- Toutes mutations ingredient/recette en queue.

**DoD:** recette editable de bout en bout.

### E14 - Liste de courses

**Route:** `src/app/(tabs)/shopping-list/index.tsx`

**API:**

- `GET /api/shopping-list`
- `POST /api/shopping-list/items`
- `PATCH /api/shopping-list/items/{id}/check|uncheck`
- `DELETE /api/shopping-list/items/{id}`
- `DELETE /api/shopping-list`
- `POST /api/shopping-list/check-thresholds`
- `POST /api/shopping-list/finish`

- [ ] Liste groupee par categorie.
- [ ] Ajout manuel, check/uncheck, suppression, vider liste.
- [ ] Finaliser courses -> impact stock.

**Offline:**

- Toutes actions en queue avec rendu optimiste.

**DoD:** flux complet courses -> stock operationnel.

### E15 - Profil

**Route:** `src/app/(tabs)/profile/index.tsx`

**API:** `GET/PUT /api/users/me`, `PATCH /api/users/me/locale`, `POST/DELETE /api/users/me/avatar`, `POST /api/auth/logout`

- [ ] Infos utilisateur (avatar, nom, email).
- [ ] Edition profil.
- [ ] Changement langue et theme.
- [ ] Logout.

**Offline:**

- Profil/locale/avatar en queue.
- Logout online prioritaire (si offline: purge locale + revoke differe).

**DoD:** utilisateur autonome sur ses preferences.

### E16 - Notifications

**Route:** `src/app/(tabs)/profile/notifications.tsx`

**API:** `PUT /api/users/me/settings`, `POST/DELETE /api/push-tokens/{token?}`

- [ ] Reglage `expirationAlertDays`.
- [ ] Opt-in push + enregistrement token device.

**Offline:**

- Settings/token mutations en queue.

**DoD:** preferences notifications appliquees et persistantes.

## 6) Sous-plan transverse (obligatoire)

### T01 - Data/API typing

- [x] Generer client API via orval depuis `/v3/api-docs`.
- [x] Centraliser handling `ApiError`.
- [ ] Normaliser invalidation query keys.

### T02 - Auth/session

- [x] Access token memory + refresh token SecureStore.
- [ ] Refresh automatique sur 401 (hors endpoints publics).
- [x] Garde de route `(auth)` vs `(tabs)`.

### T03 - Offline engine

- [ ] Connectivity observer.
- [ ] Queue persistence + replay worker.
- [ ] Optimistic updates + rollback local si erreur definitive.
- [ ] Ecran de debug interne (optionnel) pour vider/rejouer file.

### T04 - UX/UI system

- [x] Theme Paper light/dark selon palette `docs/screens.md`.
- [ ] Composants Paper standards (Card, FAB, TextInput, Dialog, Snackbar, Chip, List).
- [ ] Accessibilite: icone + texte pour etats expiration (jamais couleur seule).

### T05 - Qualite

- [ ] Tests unitaires hooks critiques (auth, queue).
- [ ] Tests integration ecrans clefs (login, stock list, shopping finish).
- [ ] Scenarios manuels offline (mode avion) documentes.

## 7) Definition of Done globale V1

- Tous les ecrans E00 -> E16 sont `[x]`.
- Toutes les mutations metier passent en queue offline et se synchronisent.
- OAuth2 Google mobile operationnel via code one-shot.
- Build de dev Expo demarre et navigation complete sans ecran template.
- Flux coeur verifie: stock -> seuil -> courses -> finalisation -> stock; recette -> consommation -> stock.

## 8) Journal de decisions (a maintenir)

- 2026-09-06: Offline V1 valide en Option A (toutes mutations en file).
- 2026-09-06: Decoupage de pilotage valide par ecran.
- 2026-09-06: UI React Native Paper prioritaire (Option A).
- 2026-09-07: Filtre categorie de l'ecran Stock (E07) valide en multi-selection (Option B).

