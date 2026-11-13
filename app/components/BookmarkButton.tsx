import { useFetcher, useLocation, useNavigate } from "@remix-run/react";
import { useEffect } from "react";

interface BookmarkButtonProps {
  adId: string;
  isBookmarked: boolean;
  className?: string;
  isLoggedIn?: boolean;
}

export function BookmarkButton({
  adId,
  isBookmarked,
  className = "",
  isLoggedIn = true,
}: BookmarkButtonProps) {
  const fetcher = useFetcher<{ error?: string; loginRequired?: boolean; bookmarked?: boolean }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Optimistic UI state
  let currentBookmarked = isBookmarked;
  if (fetcher.formData) {
    currentBookmarked = fetcher.formData.get("intent") === "add";
  } else if (fetcher.data && typeof fetcher.data.bookmarked === "boolean") {
    currentBookmarked = fetcher.data.bookmarked;
  }

  // Handle 401 redirect to login with redirectTo
  useEffect(() => {
    if (fetcher.data?.loginRequired) {
      const currentPath = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/login?redirectTo=${currentPath}`);
    }
  }, [fetcher.data, location, navigate]);

  const nextIntent = currentBookmarked ? "remove" : "add";
  const label = currentBookmarked ? "Remove bookmark" : "Save ad";

  return (
    <fetcher.Form
      method="post"
      action="/api/bookmark"
      className={`bookmark-form ${className}`}
      onSubmit={(e) => {
        if (!isLoggedIn) {
          e.preventDefault();
          const currentPath = encodeURIComponent(`${location.pathname}${location.search}`);
          navigate(`/login?redirectTo=${currentPath}`);
        }
      }}
    >
      <input type="hidden" name="adId" value={adId} />
      <input type="hidden" name="intent" value={nextIntent} />
      <button
        type="submit"
        className={`bookmark-btn ${currentBookmarked ? "bookmarked" : ""}`}
        aria-label={label}
        title={label}
        aria-pressed={currentBookmarked}
      >
        <svg
          className="bookmark-icon"
          viewBox="0 0 24 24"
          fill={currentBookmarked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </fetcher.Form>
  );
}

