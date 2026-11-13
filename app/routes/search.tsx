import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useLocation } from "@remix-run/react";
import { AdCard } from "~/components/AdCard";
import { FilterChipsBar, FilterForm, SearchPagination } from "~/components/FilterControls";
import { getUser } from "~/session.server";
import { getUserBookmarkedSet } from "~/utils/bookmarks.server";
import {
  buildFilterChips,
  getSearchFilterOptions,
  parseSearchParams,
  searchAds,
} from "~/utils/search.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Search Campaigns — Brandit" },
    { name: "robots", content: "noindex, follow" },
    {
      name: "description",
      content: "Search and filter advertising campaigns by brand, agency, medium, and track.",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const user = await getUser(request);
  const params = parseSearchParams(url);

  const [{ ads, totalCount, totalPages, currentPage }, options] = await Promise.all([
    searchAds(params),
    getSearchFilterOptions(),
  ]);

  const adIds = ads.map((a) => a.id);
  const bookmarkedSet = await getUserBookmarkedSet(user?.id, adIds);
  const bookmarkedIds = Array.from(bookmarkedSet);

  const chips = buildFilterChips(url, params);

  return json({
    ads,
    totalCount,
    totalPages,
    currentPage,
    params,
    options,
    chips,
    bookmarkedIds,
    isLoggedIn: Boolean(user),
  });
}

export default function SearchPage() {
  const { ads, totalCount, totalPages, currentPage, params, options, chips, bookmarkedIds, isLoggedIn } =
    useLoaderData<typeof loader>();
  const location = useLocation();
  const currentUrl = new URL(
    `${location.pathname}${location.search}`,
    "http://localhost" // base for parsing
  );

  return (
    <div className="search-page-container">
      <header className="page-header">
        <h1 className="page-title">
          {params.q ? `Search: "${params.q}"` : "Browse Campaigns"}
        </h1>
        <p className="page-subtitle">
          {totalCount === 1
            ? "1 campaign found"
            : `${totalCount.toLocaleString()} campaigns found`}
          {params.q ? ` for query "${params.q}"` : ""}
        </p>
      </header>

      {/* Filter Form */}
      <FilterForm
        params={params}
        actionUrl="/search"
        options={options}
        showSearchInput={true}
      />

      {/* Active Filter Chips */}
      <FilterChipsBar chips={chips} clearAllUrl="/search" />

      {/* Results Grid */}
      <section className="search-results-section" aria-label="Search results">
        {ads.length > 0 ? (
          <div className="ads-grid">
            {ads.map((ad) => (
              <AdCard
                key={ad.id}
                ad={ad}
                isBookmarked={bookmarkedIds.includes(ad.id)}
                isLoggedIn={isLoggedIn}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No matching campaigns</h3>
            <p>
              Try adjusting your search query, clearing filters, or checking your spelling.
            </p>
          </div>
        )}

        <SearchPagination
          currentPage={currentPage}
          totalPages={totalPages}
          url={currentUrl}
        />
      </section>
    </div>
  );
}

