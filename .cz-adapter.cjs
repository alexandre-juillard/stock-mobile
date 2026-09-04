"use strict";

/**
 * Adaptateur Commitizen sur-mesure pour la convention de commit stock-api :
 *
 *   [REF-JIRA]type: message de commit
 *
 * Lancer via : npm run commit
 *
 * Aucun besoin de retenir le format : ce script pose les questions et
 * assemble le message final automatiquement.
 */

const TYPES = [
  { value: "feat", name: "feat:     Nouvelle fonctionnalite" },
  { value: "fix", name: "fix:      Correction de bug" },
  { value: "refactor", name: "refactor: Refactorisation (sans changement de comportement)" },
  { value: "test", name: "test:     Ajout/modification de tests" },
  { value: "chore", name: "chore:    Tache technique (deps, config, outillage...)" },
  { value: "docs", name: "docs:     Documentation uniquement" },
  { value: "style", name: "style:    Formatage, style de code (sans impact fonctionnel)" },
  { value: "perf", name: "perf:     Amelioration de performance" },
  { value: "build", name: "build:    Build, dependances, packaging" },
  { value: "ci", name: "ci:       Integration continue (workflows, pipelines)" },
  { value: "revert", name: "revert:   Annulation d'un commit precedent" },
];

module.exports = {
  prompter(cz, commit) {
    cz.prompt([
      {
        type: "input",
        name: "ticket",
        message: "Reference Jira (ex: STOCK-123, ou NOTICKET si aucune) :",
        validate: (value) =>
          value && value.trim().length > 0
            ? true
            : "La reference Jira est obligatoire (utilisez NOTICKET si aucune).",
        filter: (value) => value.trim(),
      },
      {
        type: "list",
        name: "type",
        message: "Type de commit :",
        choices: TYPES,
      },
      {
        type: "input",
        name: "subject",
        message: "Message de commit (court, a l'imperatif, sans point final) :",
        validate: (value) =>
          value && value.trim().length > 0 ? true : "Le message de commit est obligatoire.",
        filter: (value) => value.trim().replace(/\.$/, ""),
      },
    ]).then((answers) => {
      const message = `[${answers.ticket}]${answers.type}: ${answers.subject}`;

      // Petit recap avant de valider, pratique pour se relire
      // eslint-disable-next-line no-console
      console.log(`\nMessage genere :\n  ${message}\n`);

      commit(message);
    });
  },
};

