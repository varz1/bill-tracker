// A calendar feed link is a secret (anyone holding it can read the roster), so it is checked on the way in
// and only ever shown in a masked form.

const MAX_LENGTH = 2000;

/**
 * The https URL a pasted calendar link points to, or null when it can't be used.
 * webcal:// is the same link over https. Plain http, logins in the URL, odd ports, IP addresses and
 * local names are refused so the Worker is only ever pointed at a public site.
 */
export function normalizeCalendarUrl(input: string): string | null {
  let text = input.trim();
  if (/^webcals?:\/\//i.test(text)) text = text.replace(/^webcals?:\/\//i, "https://");

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;

  const host = url.hostname.toLowerCase();
  const isLocal = host === "localhost" || /\.(local|localhost|internal)$/.test(host);
  const isAddress = host.startsWith("[") || /^[\d.]+$/.test(host);
  if (!host.includes(".") || isLocal || isAddress) return null;

  const normalized = url.toString();
  return normalized.length <= MAX_LENGTH ? normalized : null;
}

/** "p172-caldav.icloud.com/…XGsk": enough to recognise a link, not enough to use it. */
export function maskCalendarUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}/…${(u.pathname + u.search).slice(-4)}`;
  } catch {
    return "…";
  }
}
