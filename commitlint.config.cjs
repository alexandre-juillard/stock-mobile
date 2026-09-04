/**
 * Convention de commit du projet stock-api :
 *
 *   [REF-JIRA]type: message de commit
 *
 * Exemples valides :
 *   [STOCK-123]feat: ajoute l'endpoint de creation de produit
 *   [STOCK-45]fix: corrige le calcul de quantite en stock
 *   [NOTICKET]refactor: extrait le mapper produit
 *
 * Utilisez `npm run commit` pour generer ce message automatiquement via
 * une invite interactive (voir .cz-adapter.cjs), sans avoir a retenir le format.
 */
module.exports = {
  parserPreset: {
    parserOpts: {
      // Groupe 1 -> scope (reference Jira), groupe 2 -> type, groupe 3 -> subject
      headerPattern: /^\[([^\]]+)\](\w+): (.+)$/,
      headerCorrespondence: ["scope", "type", "subject"],
    },
  },
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "test",
        "chore",
        "docs",
        "style",
        "perf",
        "build",
        "ci",
        "revert",
      ],
    ],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    // La reference Jira est obligatoire (portee du commit, entre crochets)
    "scope-empty": [2, "never"],
    "scope-case": [0],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
  },
};

