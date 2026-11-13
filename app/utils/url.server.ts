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
 * - Canonicalises TikTok links to https://www.tiktok.com/@video/video/{id}
 * - Canonicalises Instagram links to https://www.instagram.com/{type}/{shortcode}
 * - Canonicalises Vimeo links to https://vimeo.com/{id}
 * - Strips marketing & tracking query parameters (utm_*, fbclid, igshid, is_from_webapp, etc.)
 * - Strips trailing slashes from pathnames
 * - Strips hash/fragments
 */
export async function normaliseUrl(rawUrl: string): Promise<string> {
  if (!isValidHttpUrl(rawUrl)) {
    throw new Error("Invalid URL: must be a valid http or https URL.");
  }

  const parsed = new URL(rawUrl.trim());

  // 1. Check platform-specific canonicalization
  try {
    const parsedAd = await parseAdUrl(parsed.href);

    if (parsedAd.platform === "YOUTUBE" && parsedAd.externalId) {
      return `https://www.youtube.com/watch?v=${parsedAd.externalId}`;
    }

    if (parsedAd.platform === "TIKTOK" && parsedAd.externalId) {
      return `https://www.tiktok.com/@video/video/${parsedAd.externalId}`;
    }

    if (parsedAd.platform === "INSTAGRAM" && parsedAd.externalId) {
      return `https://www.instagram.com/${parsedAd.externalId}`;
    }

    if (parsedAd.platform === "VIMEO" && parsedAd.externalId) {
      // If externalId has ?h=hash, format as vimeo.com/id/hash
      const [id, hashParam] = parsedAd.externalId.split("?h=");
      return hashParam ? `https://vimeo.com/${id}/${hashParam}` : `https://vimeo.com/${id}`;
    }
  } catch {
    // Fall back to general URL normalization
  }

  // 2. Lowercase host
  const host = parsed.host.toLowerCase();

  // 3. Strip tracking and social referral parameters
  const trackingParamKeys = [
    "fbclid",
    "igshid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "_ga",
    "_gl",
    "is_from_webapp",
    "sender_device",
    "sender_web_id",
    "_r",
    "_t",
    "mibextid",
    "ref",
    "source",
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
