import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { parseAdUrl } from "~/utils/parseAdUrl.server";
import { isValidHttpUrl, normaliseUrl } from "~/utils/url.server";
import { fetchOEmbedThumbnail } from "~/utils/oembed.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const urlParam = new URL(request.url).searchParams.get("url")?.trim() || "";

  if (!urlParam || !isValidHttpUrl(urlParam)) {
    return json({
      valid: false,
      platform: "OTHER",
      externalId: null,
      normalisedUrl: null,
      thumbnailUrl: null,
    });
  }

  try {
    const parsed = await parseAdUrl(urlParam);
    const normalised = await normaliseUrl(urlParam);
    const thumbnailUrl = await fetchOEmbedThumbnail(parsed.platform, normalised);

    return json({
      valid: true,
      platform: parsed.platform,
      externalId: parsed.externalId,
      normalisedUrl: normalised,
      thumbnailUrl: thumbnailUrl || null,
    });
  } catch {
    return json({
      valid: false,
      platform: "OTHER",
      externalId: null,
      normalisedUrl: null,
      thumbnailUrl: null,
    });
  }
}
