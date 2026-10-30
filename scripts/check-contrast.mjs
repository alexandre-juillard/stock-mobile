// Vérifie que les paires texte/fond de la palette respectent WCAG 2.2 AA.
// Usage : npm run check:contrast
import { darkColors, darkStatusColors, lightColors, lightStatusColors } from '../src/constants/colors.ts';
import { getContrastRatio, WCAG_AA } from '../src/utils/color-contrast.ts';

function buildChecks(colors, status) {
  const readingSurfaces = {
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    // Fond des éléments sélectionnés (ex. article coché dans la liste de courses).
    primaryContainer: colors.primaryContainer,
    ...Object.fromEntries(
      Object.entries(colors.elevation)
        .filter(([, value]) => value !== 'transparent')
        .map(([level, value]) => [`elevation.${level}`, value])
    ),
  };

  const checks = [
    ['onPrimary', colors.onPrimary, 'primary', colors.primary, WCAG_AA.text],
    ['onPrimaryContainer', colors.onPrimaryContainer, 'primaryContainer', colors.primaryContainer, WCAG_AA.text],
    ['onSecondary', colors.onSecondary, 'secondary', colors.secondary, WCAG_AA.text],
    ['onSecondaryContainer', colors.onSecondaryContainer, 'secondaryContainer', colors.secondaryContainer, WCAG_AA.text],
    ['onTertiary', colors.onTertiary, 'tertiary', colors.tertiary, WCAG_AA.text],
    ['onTertiaryContainer', colors.onTertiaryContainer, 'tertiaryContainer', colors.tertiaryContainer, WCAG_AA.text],
    ['onError', colors.onError, 'error', colors.error, WCAG_AA.text],
    ['onErrorContainer', colors.onErrorContainer, 'errorContainer', colors.errorContainer, WCAG_AA.text],
    ['inverseOnSurface', colors.inverseOnSurface, 'inverseSurface', colors.inverseSurface, WCAG_AA.text],
    ['inversePrimary', colors.inversePrimary, 'inverseSurface', colors.inverseSurface, WCAG_AA.text],
    ['onBackground', colors.onBackground, 'background', colors.background, WCAG_AA.text],
  ];

  for (const [surfaceName, surface] of Object.entries(readingSurfaces)) {
    checks.push(
      ['onSurface', colors.onSurface, surfaceName, surface, WCAG_AA.text],
      ['onSurfaceVariant', colors.onSurfaceVariant, surfaceName, surface, WCAG_AA.text],
      ['primary', colors.primary, surfaceName, surface, WCAG_AA.text],
      ['error', colors.error, surfaceName, surface, WCAG_AA.text],
      ['outline', colors.outline, surfaceName, surface, WCAG_AA.nonText]
    );

    for (const [tone, palette] of Object.entries(status)) {
      checks.push([`status.${tone}.content`, palette.content, surfaceName, surface, WCAG_AA.text]);
    }
  }

  for (const [tone, palette] of Object.entries(status)) {
    checks.push([
      `status.${tone}.onContainer`,
      palette.onContainer,
      `status.${tone}.container`,
      palette.container,
      WCAG_AA.text,
    ]);
  }

  return checks;
}

let failureCount = 0;

for (const [mode, colors, status] of [
  ['clair', lightColors, lightStatusColors],
  ['sombre', darkColors, darkStatusColors],
]) {
  const checks = buildChecks(colors, status);
  const results = checks.map(([foregroundName, foreground, backgroundName, background, minimum]) => ({
    label: `${foregroundName} sur ${backgroundName}`,
    ratio: getContrastRatio(foreground, background),
    minimum,
  }));
  const failures = results.filter(({ ratio, minimum }) => ratio < minimum);
  const weakest = results.reduce((lowest, result) =>
    result.ratio / result.minimum < lowest.ratio / lowest.minimum ? result : lowest
  );

  console.log(
    `Mode ${mode} : ${results.length - failures.length}/${results.length} paires conformes ` +
      `(marge la plus faible : ${weakest.label}, ${weakest.ratio.toFixed(2)}:1)`
  );

  for (const { label, ratio, minimum } of failures) {
    console.error(`  ✗ ${label} : ${ratio.toFixed(2)}:1 (minimum ${minimum}:1)`);
  }

  failureCount += failures.length;
}

if (failureCount > 0) {
  process.exitCode = 1;
}
