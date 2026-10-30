const HEX_COLOR_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Seuils WCAG 2.2 (niveau AA). */
export const WCAG_AA = {
  text: 4.5,
  largeText: 3,
  nonText: 3,
} as const;

function toLinearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function parseHexColor(color: string): [number, number, number] | null {
  const match = HEX_COLOR_PATTERN.exec(color.trim());
  if (!match) {
    return null;
  }

  const hex = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
  const value = Number.parseInt(hex, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Luminance relative WCAG d'une couleur hexadécimale, ou null si non analysable. */
export function getRelativeLuminance(color: string): number | null {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return null;
  }

  const [red, green, blue] = rgb.map(toLinearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Ratio de contraste WCAG entre deux couleurs hexadécimales (1 à 21). */
export function getContrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);

  if (foregroundLuminance === null || backgroundLuminance === null) {
    return 1;
  }

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Choisit, parmi les candidates, la couleur de texte la plus lisible sur un
 * fond arbitraire (ex. couleur de catégorie choisie par l'utilisateur).
 */
export function getReadableTextColor(
  background: string,
  candidates: readonly string[] = ['#081C15', '#FFFFFF']
): string {
  return candidates.reduce((best, candidate) =>
    getContrastRatio(candidate, background) > getContrastRatio(best, background) ? candidate : best
  );
}
