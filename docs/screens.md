# Écrans & navigation — stock-mobile

Spec fonctionnelle des écrans de l'app, déduite des fonctionnalités déjà exposées par stock-api.
Pas de maquette visuelle : chaque écran sera construit directement avec les composants de
React Native Paper, sans étape de design intermédiaire.

## 1. Authentification (pile hors tab-bar)

| Écran | Contenu | Actions | Navigue vers |
|---|---|---|---|
| Connexion | Email/mot de passe, "Se souvenir de moi", bouton Google | Login classique, Login Google, lien inscription, mot de passe oublié | Accueil, Inscription, Mot de passe oublié |
| Inscription | Email, mot de passe, prénom, nom | Créer le compte | Écran "Vérifiez vos emails" |
| Vérification email en attente | Message + bouton renvoyer | Renvoyer l'email | (reste sur place) |
| Mot de passe oublié | Champ email | Envoyer le lien | Connexion |
| Réinitialisation mot de passe | Nouveau mot de passe (deep link email) | Valider | Connexion |
| Confirmation liaison de compte | "Compte existant, lier avec Google ?" | Lier / Créer séparé | Accueil |

## 2. Navigation principale (tab bar)
- Stock (par défaut) · Recettes · Courses · Profil

## 3. Stock
| Écran | Contenu | Actions | Navigue vers |
|---|---|---|---|
| Liste du stock | Produits, filtrage par catégorie, alerte expiration | Rechercher, filtrer, ajouter | Détail, Ajout, Catégories |
| Détail produit | Nom, quantité, unité, expiration, photo, catégorie | Modifier quantité, marquer consommé, éditer | Édition produit |
| Ajout/édition produit | Formulaire complet | Enregistrer | Retour liste |
| Gestion catégories | Liste + CRUD | Créer/éditer/supprimer | (reste sur place) |

## 4. Recettes
| Écran | Contenu | Actions | Navigue vers |
|---|---|---|---|
| Liste des recettes | Recettes, "réalisable avec mon stock" | Rechercher, créer | Détail, Création |
| Détail recette | Ingrédients (dispo/non dispo), étapes | Éditer, supprimer, ajouter manquants aux courses | Édition |
| Création/édition recette | Nom, ingrédients, étapes | Enregistrer | Retour liste |

## 5. Liste de courses
| Écran | Contenu | Actions |
|---|---|---|
| Liste de courses | Articles à acheter | Cocher, ajouter, supprimer |

## 6. Profil / paramètres
| Écran | Contenu | Actions | Navigue vers |
|---|---|---|---|
| Profil | Avatar, nom, email, thème, langue | Modifier, changer mot de passe, déconnexion | Édition profil |
| Notifications | Alertes push, délai d'alerte expiration | Enregistrer préférences | (reste sur place) |

## Points ouverts à trancher ensemble
1. Écran dashboard séparé de "Stock", ou "Stock" = accueil ? *(proposition : pas de dashboard en V1)*
2. Scan code-barre pour l'ajout produit : V1 ou reporté ?
3. Mode hors-ligne (cache local) : V1 ou plus tard ?

## Réponses aux questions ouvertes
1. Pas de dashboard séparé en V1, l'écran "Stock" servira d'accueil.
2. Scan code-barre pour l'ajout produit : reporté à plus tard.
3. Mode hors-ligne (cache local) : à intégrer dès la V1, pour permettre l'utilisation de l'app sans connexion internet, sauf si contrainte technique majeure.

## Thème couleur

Statut : **validé** (Option B — séparation nette entre secondaire et couleurs sémantiques d'alerte).

| Rôle | Couleur | Usage |
|---|---|---|
| **Primaire** | `#2D6A4F` | Marque, boutons principaux, onglet actif de la tab-bar (login, "ajouter un produit"...) |
| **Secondaire** | `#F4A261` | Actions secondaires, filtres, accents neutres (boutons outline, chips de catégorie...) |
| **Avertissement** | `#E9C46A` | Produits approchant la date limite — volontairement éloigné du rouge sur le cercle chromatique pour ne pas être confondu avec l'alerte critique |
| **Alerte / Expiration critique** | `#D90429` | Exclusivement produits périmés / à consommer immédiatement, suppression |
| **Succès / Confirmation** | `#52B788` | Ajout réussi, sauvegarde de recette, retour positif |
| **Fond** | `#F8F9FA` | Fond d'écran général (léger cassé, réduit la fatigue visuelle) |
| **Surface** | `#FFFFFF` | Cartes, modales, champs de saisie |
| *Accent Recettes (réservé)* | `#E76F51` | Libéré du rôle secondaire — non utilisé en V1, disponible plus tard pour distinguer ponctuellement la section Recettes si besoin |

### Code couleur du système d'expiration

⚠️ **Règle d'accessibilité (obligatoire)** : chaque état est *toujours* accompagné d'une icône et d'un
libellé texte — jamais de la couleur seule (daltonisme rouge/vert, ~8% des hommes concernés ; critère WCAG 1.4.1).

| État | Fond | Texte | Icône (suggestion) | Libellé |
|---|---|---|---|---|
| Frais | `#D8F3DC` | `#081C15` | ✓ check | "Frais" |
| Bientôt périmé | `#E9C46A` | `#081C15` (texte foncé) | ⚠ triangle | "À consommer rapidement !" |
| Périmé | `#D90429` | `#FFFFFF` | ✕ croix | "Périmé" |

## Thème couleur — Dark Mode

Statut : **validé comme point de départ**, ajustable ensuite à l'usage.

Principe : ne pas inverser les couleurs telles quelles (une couleur saturée "vibre" sur fond noir et
fatigue l'œil) — on éclaircit les tons qui doivent porter du texte/contraste, on garde les fonds sur
un noir légèrement teinté plutôt qu'un noir pur.

| Rôle | Light | Dark |
|---|---|---|
| Primaire | `#2D6A4F` | `#40916C` *(nuance intermédiaire de la même famille de verts — distincte du succès pour éviter toute confusion)* |
| Secondaire | `#F4A261` | `#F4A261` *(déjà assez clair, inchangé)* |
| Avertissement | `#E9C46A` | `#E9C46A` *(inchangé)* |
| Alerte | `#D90429` | `#D90429` *(inchangé — utilisé en fond de badge, pas en texte-sur-fond)* |
| Succès | `#52B788` | `#52B788` *(inchangé)* |
| Fond | `#F8F9FA` | `#121714` |
| Surface (cartes) | `#FFFFFF` | `#1B211D` |
| Texte principal | `#081C15` | `#E8ECEA` |

## Typographie

Statut : **validé**.

Police système native (aucune police custom embarquée) : **San Francisco** (iOS) / **Roboto**
(Android), gérées automatiquement par React Native Paper sans configuration de fichiers d'assets.
Choix motivé par la légèreté du bundle, la lisibilité optimisée par plateforme, et l'intégration
native des graisses (weights).

Échelle typographique Material Design 3 :

| Rôle | Taille | Line-height | Poids | Usage |
|---|---|---|---|---|
| Headline Medium | 28px | 36px | 600 (Semi-Bold) | Titres d'écran ("Mon Stock", "Recettes") |
| Title Large | 22px | 28px | 600 (Semi-Bold) | Noms de produit (détail), titres de cartes recette |
| Title Medium | 16px | 24px | 500 (Medium) | Noms d'articles (liste stock / courses) |
| Body Large | 16px | 24px | 400 (Regular) | Description de recette, instructions de cuisine |
| Body Medium | 14px | 20px | 400 (Regular) | Champs de formulaire, sous-titres, explications |
| Label Large | 14px | 20px | 500 (Medium) | Libellés de boutons ("Ajouter aux courses") |
| Label Medium | 12px | 16px | 500 (Medium) | Badges de péremption ("Périmé", "J-2"), filtres |
| Label Small | 11px | 16px | 500 (Medium) | Mentions légales, informations secondaires (unités g/mL) |

> Note technique : Android/Roboto ne propose nativement que les graisses 400/500/700 — un poids 600
> sera automatiquement ramené au plus proche disponible par le moteur de rendu. À vérifier
> visuellement sur device réel lors de l'implémentation, sans remettre en cause ce choix.

## Langage de forme

Statut : **validé**.

Positionnement : un ton chaleureux, accessible et rassurant — un compagnon de cuisine du quotidien,
pas un outil de gestion d'entrepôt. Organisé mais convivial, traduit visuellement par des formes
généreusement arrondies plutôt que des angles droits.

| Composant | Style | Rayon | Justification |
|---|---|---|---|
| Boutons principaux (Connexion, Ajouter) | Fully Rounded (Pill) | 100dp (ou height/2) | Moderne, amical, très cliquable |
| Cartes (Produit, Recette) | Extra Large | 16–20dp | Douceur visuelle, détache bien du fond |
| Champs de saisie (Inputs) | Medium | 12dp | Équilibre structure / rondeur |
| Badges & Tags (Périmé, Catégorie) | Small / Pill | 8–12dp | Compact et lisible sans masquer le texte |
| Modales & Bottom Sheets | Extra Large (haut) | 28dp | Accueillant à l'ouverture / au glissement |

Iconographie : traits légèrement arrondis (**Material Symbols Rounded**), cohérent avec le
langage de forme ci-dessus — à privilégier systématiquement sur la variante "Sharp"/"Outlined" par défaut.

## Élévation & ombres

Statut : **validé**.

Principe : privilégier la **teinte de surface** (surface tone, Material Design 3) plutôt que des
ombres portées marquées, pour garder une app lumineuse et fluide — l'objectif étant l'ambiance
"carnet de cuisine domestique", pas "tableau de bord SaaS/ERP". Les fortes ombres (élévation 4+)
créent du bruit visuel sur des cartes denses en texte court (quantité, date, catégorie) et sont donc
évitées. Géré via la prop `elevation` du composant `<Card>` de React Native Paper.

| Élévation | Usage dans l'app | Rendu visuel & rôle |
|---|---|---|
| 0 (Flat / Outlined) | Filtres de catégories, items de la liste de courses | Carte plate avec fine bordure neutre `#D8DBE2` — idéal pour listes denses |
| 1 (défaut) | Cartes de produits (Stock), cartes de recettes | Ombre quasi-invisible, légère teinte — sépare délicatement du fond `#F8F9FA` |
| 2 | Carte produit sélectionnée / survolée | Accentue la carte en cours d'interaction avant ouverture du détail |
| 3 | Modales, filtres flottants, Bottom Sheets | Détache nettement l'élément par-dessus le reste du contenu |

Élévations 4 et au-delà : **non utilisées** dans l'app.

## Ton & micro-copy

Statut : **validé** — **tutoiement**, pour renforcer le ton "compagnon chaleureux" et rendre
l'expérience plus agréable et proche de l'utilisateur.

Principe : direct, bienveillant, concret — jamais de jargon technique ou de ton alarmiste. On
s'adresse à quelqu'un qui gère son quotidien, pas à un opérateur de système.

| À éviter (ton "outil technique") | À privilégier (ton "compagnon du quotidien") |
|---|---|
| "0 article détecté" | "Ton garde-manger est vide" |
| "Alerte péremption critique" | "À consommer rapidement !" |
| "Erreur : champ requis" | "N'oublie pas de renseigner ce champ" |
| "Suppression effectuée" | "Produit retiré de ton stock" |

## Logo & identité de marque

Statut : **à définir plus tard** — dépend du choix du nom de l'application (pas encore trouvé).
Une fois un nom retenu, le logo sera construit à partir de celui-ci (typographique ou monogramme),
en cohérence avec la palette et le langage de forme arrondi définis ci-dessus.

## Points restant à définir

1. Nom de l'application, puis logo / icône construits à partir de ce nom.
2. Éventuel usage futur de l'accent Recettes réservé (`#E76F51`).

## Idées de nom d'application
Autour de la fraîcheur / anti-gaspi

Fraîcheur+
Zérodate — joue sur "zéro date de péremption dépassée"
Gaspizéro — positionne clairement l'appli sur la lutte anti-gaspillage

Autour de l'intelligence / praticité

Stockly — suffixe "-ly" très app moderne
Frigolino — plus ludique/familial
Pantrix — anglicisme mais sonne bien à l'international si vous visez plusieurs pays

1. Noms évocateurs & conviviaux (Univers cuisine / maison)
Noms chaleureux, faciles à retenir, qui sonnent comme un assistant du quotidien.

Pantri (ou Pantry) : Simple, direct, international. Fait immédiatement penser au garde-manger (pantry en anglais).
Gourmi : Évoque la gourmandise tout en restant court et accessible.
Plato : Référence au plat cuisiné et au plateau, facile à prononcer et très moderne.
Popote : Très chaleureux et français, évoque la cuisine du quotidien sans prise de tête.
Kitchi : Dérivé de kitchen, ludique et dynamique.

PantryFlow (j'aime l'idée de "flow" pour le côté pratique et fluide de l'app)
PantryPal (j'aime l'idée de "pal" pour le côté compagnon de cuisine)

2. Noms axés sur l'anti-gaspillage & l'action
Mettent l'accent sur le suivi des dates, la gestion intelligente et l'économie au quotidien.
Freshly : Met l'accent sur la fraîcheur des aliments et le contrôle des péremptions.
Keepi (ou Keepit) : Évoque le fait de conserver, garder sous contrôle et ne rien jeter.
Stocki : Court, explicite sur la fonctionnalité de stock, avec une terminaison en "-i" très "app mobile".
Kupboard : Variante stylisée de cupboard (placard), très explicite pour le store.
OptiMiam : Joue sur "optimiser" son stock et la gourmandise ("miam").

3. Noms basés sur le flux "Stock > Recette > Courses"
Noms qui englobent tout le cercle vertueux de ton application (du placard à la recette, puis à la liste).
Placard & Poêle : Très visuel et convivial, montre le lien direct entre les ingrédients disponibles et la cuisine.
LoopEats / FoodLoop : Évoque la boucle complète : achat $\rightarrow$ stock $\rightarrow$ recette $\rightarrow$ réapprovisionnement.
MenuStock : Clair et pragmatique pour le référencement sur les stores (ASO).

## Noms retenus pour la V1
- **PantryFlow** : met l'accent sur le côté pratique et fluide de l'app, tout en restant international.
- **PantryPal** : met l'accent sur le côté compagnon de cuisine, chaleureux et accessible.



