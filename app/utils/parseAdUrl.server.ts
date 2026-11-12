import type { Platform } from "@prisma/client";

export interface ParsedAdUrl {
  platform: Platform;
  externalId: string | null;
}

/**
 * Parses a media URL to extract its platform and canonical external ID.
 *
 * Supported examples:
 * - YouTube watch: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -> { platform: "YOUTUBE", externalId: "dQw4w9WgXcQ" }
 * - YouTube short link: "https://youtu.be/dQw4w9WgXcQ" -> { platform: "YOUTUBE", externalId: "dQw4w9WgXcQ" }
 * - YouTube Shorts: "https://www.youtube.com/shorts/dQw4w9WgXcQ" -> { platform: "YOUTUBE", externalId: "dQw4w9WgXcQ" }
 * - Instagram post/reel: "https://www.instagram.com/p/C-xyz123/" -> { platform: "INSTAGRAM", externalId: "C-xyz123" }
 * - TikTok video: "https://www.tiktok.com/@brand/video/7123456789012345678" -> { platform: "TIKTOK", externalId: "7123456789012345678" }
 * - Facebook video: "https://www.facebook.com/watch/?v=123456789" -> { platform: "FACEBOOK", externalId: "123456789" }
 * - Other external link: "https://example.com/ad-campaign" -> { platform: "OTHER", externalId: null }
 */
export function parseAdUrl(rawUrl: string): ParsedAdUrl {
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
  // Matches: youtube.com, m.youtube.com, youtu.be, youtube-nocookie.com
  if (
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtube-nocookie.com"
  ) {
    // /watch?v=VIDEO_ID
    if (pathname === "/watch") {
      const v = parsedUrl.searchParams.get("v");
      if (v) {
        return { platform: "YOUTUBE", externalId: v };
      }
    }

    // /shorts/VIDEO_ID
    const shortsMatch = pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) {
      return { platform: "YOUTUBE", externalId: shortsMatch[1] };
    }

    // /embed/VIDEO_ID
    const embedMatch = pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch) {
      return { platform: "YOUTUBE", externalId: embedMatch[1] };
    }

    return { platform: "YOUTUBE", externalId: null };
  }

  if (hostname === "youtu.be") {
    // youtu.be/VIDEO_ID
    const id = pathname.replace(/^\/+/, "").split("/")[0]?.split("?")[0];
    return {
      platform: "YOUTUBE",
      externalId: id || null,
    };
  }

  // 2. Instagram
  // Matches: instagram.com/p/ID, instagram.com/reel/ID, instagram.com/tv/ID
  if (hostname === "instagram.com") {
    const instaMatch = pathname.match(/^\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/);
    return {
      platform: "INSTAGRAM",
      externalId: instaMatch ? instaMatch[1] : null,
    };
  }

  // 3. TikTok
  // Matches: tiktok.com/@user/video/ID or vm.tiktok.com/ID
  if (hostname === "tiktok.com") {
    const tiktokMatch = pathname.match(/\/video\/(\d+)/);
    return {
      platform: "TIKTOK",
      externalId: tiktokMatch ? tiktokMatch[1] : null,
    };
  }

  if (hostname === "vm.tiktok.com") {
    const shortId = pathname.replace(/^\/+/, "").split("/")[0];
    return {
      platform: "TIKTOK",
      externalId: shortId || null,
    };
  }

  // 4. Facebook
  // Matches: facebook.com/watch/?v=ID, facebook.com/user/videos/ID, fb.watch/ID
  if (hostname === "facebook.com" || hostname === "m.facebook.com" || hostname === "web.facebook.com") {
    const vParam = parsedUrl.searchParams.get("v");
    if (vParam) {
      return { platform: "FACEBOOK", externalId: vParam };
    }

    const videoMatch = pathname.match(/\/videos\/(\d+)/);
    if (videoMatch) {
      return { platform: "FACEBOOK", externalId: videoMatch[1] };
    }

    return { platform: "FACEBOOK", externalId: null };
  }

  if (hostname === "fb.watch") {
    const fbWatchId = pathname.replace(/^\/+/, "").split("/")[0];
    return {
      platform: "FACEBOOK",
      externalId: fbWatchId || null,
    };
  }

  // 5. Default / Other
  return {
    platform: "OTHER",
    externalId: null,
  };
}
