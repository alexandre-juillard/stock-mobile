type UnauthorizedListener = () => void;

const listeners = new Set<UnauthorizedListener>();

/**
 * S'abonne aux évènements "session invalide" (token expiré ou invalide).
 * Retourne une fonction de désabonnement.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Déclenché par le client HTTP lorsqu'une requête authentifiée reçoit une
 * réponse 401 (token invalide/expiré), afin que la session locale soit
 * effacée et que l'utilisateur soit redirigé vers l'écran de connexion.
 */
export function emitUnauthorized(): void {
  listeners.forEach((listener) => listener());
}

