import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { parseAdUrl } from "~/utils/parseAdUrl.server";
import { isValidHttpUrl, normaliseUrl } from "~/utils/url.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const urlParam = new URL(request.url).searchParams.get("url")?.trim() || "";

  if (!urlParam || !isValidHttpUrl(urlParam)) {
    return json({
      valid: false,
      platform: "OTHER",
      externalId: null,
      normalisedUrl: null,
    });
  }

  try {
    const parsed = parseAdUrl(urlParam);
    const normalised = normaliseUrl(urlParam);

    return json({
      valid: true,
      platform: parsed.platform,
      externalId: parsed.externalId,
      normalisedUrl: normalised,
    });
  } catch {
    return json({
      valid: false,
      platform: "OTHER",
      externalId: null,
      normalisedUrl: null,
    });
  }
}
