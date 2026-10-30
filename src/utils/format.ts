const LOCALE = 'fr-FR';

// Instancier un Intl.*Format est coûteux : on réutilise les instances,
// notamment pour les listes qui formatent à chaque rendu d'élément.
const numberFormatters = new Map<number, Intl.NumberFormat>();
const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function getNumberFormatter(maximumFractionDigits: number): Intl.NumberFormat {
  let formatter = numberFormatters.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits });
    numberFormatters.set(maximumFractionDigits, formatter);
  }

  return formatter;
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return getNumberFormatter(maximumFractionDigits).format(value);
}

/** Retourne 0 pour une valeur absente ou NaN. */
export function normalizeQuantity(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return value;
}

/** Accepte la virgule comme séparateur décimal (saisie clavier FR). */
export function parseDecimalInput(value: string): number {
  return Number.parseFloat(value.replace(',', '.'));
}

/** Formate une date ISO en JJ/MM/AAAA, ou retourne null si elle est invalide. */
export function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return dateFormatter.format(date);
}
