export function getFirstRouteParam(param: string | string[] | undefined): string | null {
  if (!param) {
    return null;
  }

  return Array.isArray(param) ? (param[0] ?? null) : param;
}
