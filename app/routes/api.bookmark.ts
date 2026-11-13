import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getUser } from "~/session.server";
import { toggleBookmark } from "~/utils/bookmarks.server";
import { checkBookmarkRateLimit, createRateLimitResponse } from "~/utils/rateLimit.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getUser(request);
  if (!user) {
    return json(
      { error: "Authentication required", loginRequired: true },
      { status: 401 }
    );
  }

  if (checkBookmarkRateLimit(user.id)) {
    return createRateLimitResponse("Too many bookmark actions. Please try again later.");
  }

  const formData = await request.formData();
  const adId = formData.get("adId")?.toString();
  const intent = formData.get("intent")?.toString();

  if (!adId || (intent !== "add" && intent !== "remove")) {
    return json({ error: "Invalid adId or intent" }, { status: 400 });
  }

  const result = await toggleBookmark(user.id, adId, intent);
  return json({ success: true, ...result, adId });
}

export function loader() {
  return json({ error: "Method not allowed" }, { status: 405 });
}

