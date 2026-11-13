import { Platform } from "@prisma/client";

export interface ParsedAdUrl {
  platform: Platform;
  externalId: string | null;
}

const ALLOWED_TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

/**
 * Resolves TikTok short links (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/...)
 * by following redirects up to 2 hops strictly within TikTok domains.
 */
async function resolveTikTokShortLink(url: string): Promise<string | null> {
  let currentUrl = url;
  const timeoutMs = 3000;

  for (let hop = 0; hop < 2; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const parsed = new URL(currentUrl);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (!ALLOWED_TIKTOK_HOSTS.has(host) && !ALLOWED_TIKTOK_HOSTS.has(parsed.hostname.toLowerCase())) {
        return null;
      }

      const res = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BranditBot/1.0)",
        },
      });

      const location = res.headers.get("location");
      if (!location) {
        // If HEAD didn't redirect or gave no Location, try GET
        if (res.status >= 300 && res.status < 400) {
          return null;
        }
        return currentUrl;
      }

      const nextUrl = new URL(location, currentUrl);
      const nextHost = nextUrl.hostname.toLowerCase().replace(/^www\./, "");
      if (!ALLOWED_TIKTOK_HOSTS.has(nextHost) && !ALLOWED_TIKTOK_HOSTS.has(nextUrl.hostname.toLowerCase())) {
        return null;
      }

      currentUrl = nextUrl.href;
      // If we landed on a canonical video URL, stop
      if (currentUrl.includes("/video/")) {
        return currentUrl;
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return currentUrl;
}

/**
 * Parses an ad URL into its platform and verified external ID.
 */
export async function parseAdUrl(rawUrl: string): Promise<ParsedAdUrl> {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Invalid URL: URL must be a non-empty string.");
  }

  const trimmed = rawUrl.trim();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL provided: "${rawUrl}". Please provide a valid absolute URL.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = parsedUrl.pathname;

  // 1. YouTube
  if (
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtube-nocookie.com"
  ) {
    if (pathname === "/watch") {
      const v = parsedUrl.searchParams.get("v");
      if (v) return { platform: Platform.YOUTUBE, externalId: v };
    }

    const shortsMatch = pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) {
      return { platform: Platform.YOUTUBE, externalId: shortsMatch[1] };
    }

    const embedMatch = pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch) {
      return { platform: Platform.YOUTUBE, externalId: embedMatch[1] };
    }

    return { platform: Platform.YOUTUBE, externalId: null };
  }

  if (hostname === "youtu.be") {
    const id = pathname.replace(/^\/+/, "").split("/")[0]?.split("?")[0];
    return { platform: Platform.YOUTUBE, externalId: id || null };
  }

  // 2. Vimeo
  // Matches: vimeo.com/<id>, vimeo.com/<id>/<hash>, player.vimeo.com/video/<id>
  if (hostname === "vimeo.com" || hostname === "player.vimeo.com") {
    // player.vimeo.com/video/<id>
    const playerMatch = pathname.match(/^\/video\/(\d+)(?:\/([a-zA-Z0-9]+))?/);
    if (playerMatch) {
      const id = playerMatch[1];
      const hash = playerMatch[2] || parsedUrl.searchParams.get("h");
      return {
        platform: Platform.VIMEO,
        externalId: hash ? `${id}?h=${hash}` : id,
      };
    }

    // vimeo.com/<id> or vimeo.com/<id>/<hash>
    const standardMatch = pathname.match(/^\/(\d+)(?:\/([a-zA-Z0-9]+))?/);
    if (standardMatch) {
      const id = standardMatch[1];
      const hash = standardMatch[2] || parsedUrl.searchParams.get("h");
      return {
        platform: Platform.VIMEO,
        externalId: hash ? `${id}?h=${hash}` : id,
      };
    }

    return { platform: Platform.VIMEO, externalId: null };
  }

  // 3. Instagram
  // Matches: instagram.com/p/<shortcode>, /reel/<shortcode>, /tv/<shortcode>
  if (hostname === "instagram.com") {
    const instaMatch = pathname.match(/^\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/);
    if (instaMatch) {
      const type = instaMatch[1];
      const shortcode = instaMatch[2];
      return {
        platform: Platform.INSTAGRAM,
        externalId: `${type}/${shortcode}`,
      };
    }
    return { platform: Platform.INSTAGRAM, externalId: null };
  }

  // 4. TikTok
  // Matches: tiktok.com/@user/video/<id>, or shortlinks vm.tiktok.com, vt.tiktok.com, tiktok.com/t/<id>
  if (
    hostname === "tiktok.com" ||
    hostname === "vm.tiktok.com" ||
    hostname === "vt.tiktok.com"
  ) {
    // Direct canonical video URL: /@user/video/<id> or /video/<id>
    const directMatch = pathname.match(/\/video\/(\d+)/);
    if (directMatch) {
      return {
        platform: Platform.TIKTOK,
        externalId: directMatch[1],
      };
    }

    // Short links: vm.tiktok.com/<shortcode>, vt.tiktok.com/<shortcode>, tiktok.com/t/<shortcode>
    const isShortLink =
      hostname === "vm.tiktok.com" ||
      hostname === "vt.tiktok.com" ||
      pathname.startsWith("/t/");

    if (isShortLink) {
      const resolved = await resolveTikTokShortLink(parsedUrl.href);
      if (resolved) {
        const resolvedUrl = new URL(resolved);
        const resolvedMatch = resolvedUrl.pathname.match(/\/video\/(\d+)/);
        if (resolvedMatch) {
          return {
            platform: Platform.TIKTOK,
            externalId: resolvedMatch[1],
          };
        }
      }
    }

    // If resolution fails or no numeric id found, still return TIKTOK with null externalId
    return { platform: Platform.TIKTOK, externalId: null };
  }

  // 5. Facebook
  // Matches:
  // facebook.com/.../videos/<id>
  // facebook.com/watch/?v=<id>
  // fb.watch/<code>
  // facebook.com/reel/<id>
  // facebook.com/<page>/posts/<id>
  if (
    hostname === "facebook.com" ||
    hostname === "m.facebook.com" ||
    hostname === "web.facebook.com" ||
    hostname === "fb.watch"
  ) {
    // For Facebook, externalId stores the normalised absolute URL (clean, tracking-free)
    // to be passed safely into the plugin iframe href
    const cleanUrl = new URL(parsedUrl.href);
    // Strip tracking parameters
    const toRemove: string[] = [];
    cleanUrl.searchParams.forEach((_, key) => {
      const lk = key.toLowerCase();
      if (lk.startsWith("utm_") || lk === "fbclid" || lk === "ref" || lk === "mibextid") {
        toRemove.push(key);
      }
    });
    toRemove.forEach((k) => cleanUrl.searchParams.delete(k));

    return {
      platform: Platform.FACEBOOK,
      externalId: cleanUrl.href,
    };
  }

  // 6. Default / Other
  return {
    platform: Platform.OTHER,
    externalId: null,
  };
}
