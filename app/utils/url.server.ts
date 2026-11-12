import { parseAdUrl } from "./parseAdUrl.server";

/**
 * Validates whether a given string is a valid absolute HTTP or HTTPS URL.
 */
export function isValidHttpUrl(stringUrl: unknown): boolean {
  if (!stringUrl || typeof stringUrl !== "string") {
    return false;
  }

  try {
    const parsed = new URL(stringUrl.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalises an ad URL for duplicate detection:
 * - Lowers hostname
 * - Canonicalises YouTube links to standard https://www.youtube.com/watch?v={id}
 * - Strips marketing & tracking query parameters (utm_*, fbclid, igshid, etc.)
 * - Strips trailing slashes from pathnames
 * - Strips hash/fragments
 */
export function normaliseUrl(rawUrl: string): string {
  if (!isValidHttpUrl(rawUrl)) {
    throw new Error("Invalid URL: must be a valid http or https URL.");
  }

  const parsed = new URL(rawUrl.trim());

  // 1. YouTube canonicalization
  try {
    const parsedAd = parseAdUrl(parsed.href);
    if (parsedAd.platform === "YOUTUBE" && parsedAd.externalId) {
      return `https://www.youtube.com/watch?v=${parsedAd.externalId}`;
    }
  } catch {
    // Fall back to general URL normalization
  }

  // 2. Lowercase host
  const host = parsed.host.toLowerCase();

  // 3. Strip tracking parameters
  const trackingParamKeys = [
    "fbclid",
    "igshid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "_ga",
    "_gl",
  ];

  const searchParams = new URLSearchParams(parsed.search);
  const keysToDelete: string[] = [];

  for (const key of searchParams.keys()) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith("utm_") || trackingParamKeys.includes(lowerKey)) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    searchParams.delete(key);
  }

  // 4. Strip trailing slash from pathname (keep single slash if root)
  let pathname = parsed.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const queryString = searchParams.toString();
  const search = queryString ? `?${queryString}` : "";

  return `${parsed.protocol}//${host}${pathname}${search}`;
}
