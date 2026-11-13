import { Platform } from "@prisma/client";

/**
 * Fetches oEmbed thumbnail for TikTok or Vimeo ads during submission.
 * Enforces strict SSRF protections:
 * - Only requests hardcoded trusted endpoints (www.tiktok.com, vimeo.com).
 * - 3-second timeout via AbortController.
 * - Validates that the returned thumbnail is a valid https URL.
 * - Silently ignores any failures or non-200 responses.
 */
export async function fetchOEmbedThumbnail(
  platform: Platform,
  canonicalUrl: string
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    let endpoint: string | null = null;

    if (platform === Platform.TIKTOK) {
      endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
    } else if (platform === Platform.VIMEO) {
      endpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonicalUrl)}`;
    }

    if (!endpoint) {
      return null;
    }

    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Brandit-AdGallery/1.0",
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const thumbnailUrl = data?.thumbnail_url;

    if (typeof thumbnailUrl === "string" && thumbnailUrl.startsWith("https://")) {
      return thumbnailUrl;
    }

    return null;
  } catch {
    // Timeout or network error - ignore gracefully so submission succeeds
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

