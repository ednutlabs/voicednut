// bot/mini-app/src/helpers/publicUrl.ts
export function publicUrl(path: string): string {
  let baseUrl = import.meta.env.BASE_URL;
  if (!baseUrl.endsWith('/')) {
    baseUrl += '/';
  }

  let isBaseAbsolute = false;
  try {
    new URL(baseUrl);
    isBaseAbsolute = true;
  } catch { /* empty */ }

  return new URL(
    path.replace(/^\/+/, ''),
    isBaseAbsolute
      ? baseUrl
      : window.location.origin + baseUrl,
  ).toString();
}