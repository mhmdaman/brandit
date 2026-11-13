import { Form, Link } from "@remix-run/react";
import type { FilterChip, SearchParams } from "~/utils/search.server";
import { buildPaginationUrl } from "~/utils/search.server";

interface FilterFormProps {
  params: SearchParams;
  actionUrl: string;
  options: {
    years: number[];
    countries: string[];
  };
  hideTrackSelect?: boolean;
  showSearchInput?: boolean;
}

export function FilterForm({
  params,
  actionUrl,
  options,
  hideTrackSelect = false,
  showSearchInput = true,
}: FilterFormProps) {
  return (
    <Form method="get" action={actionUrl} className="search-filter-form">
      {showSearchInput && (
        <div className="filter-input-group filter-q-group">
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Search keywords..."
            className="filter-search-input"
          />
        </div>
      )}

      <div className="filter-selects-row">
        {/* Medium Select */}
        <div className="filter-field">
          <label htmlFor="filter-medium" className="filter-field-label">
            Medium
          </label>
          <select
            id="filter-medium"
            name="medium"
            defaultValue={params.medium || ""}
            className="filter-select"
          >
            <option value="">All Mediums</option>
            <option value="VIDEO">Video</option>
            <option value="PRINT">Print</option>
            <option value="OUTDOOR">Outdoor</option>
            <option value="DIGITAL">Digital</option>
            <option value="SOCIAL">Social</option>
            <option value="AUDIO">Audio</option>
          </select>
        </div>

        {/* Track Select (hidden if fixed on /professional or /student) */}
        {!hideTrackSelect ? (
          <div className="filter-field">
            <label htmlFor="filter-track" className="filter-field-label">
              Track
            </label>
            <select
              id="filter-track"
              name="track"
              defaultValue={params.track || ""}
              className="filter-select"
            >
              <option value="">All Tracks</option>
              <option value="PROFESSIONAL">Professional</option>
              <option value="STUDENT">Student</option>
            </select>
          </div>
        ) : (
          params.track && <input type="hidden" name="track" value={params.track} />
        )}

        {/* Platform Select */}
        <div className="filter-field">
          <label htmlFor="filter-platform" className="filter-field-label">
            Platform
          </label>
          <select
            id="filter-platform"
            name="platform"
            defaultValue={params.platform || ""}
            className="filter-select"
          >
            <option value="">All Platforms</option>
            <option value="YOUTUBE">YouTube</option>
            <option value="VIMEO">Vimeo</option>
            <option value="TIKTOK">TikTok</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        {/* Year Select */}
        <div className="filter-field">
          <label htmlFor="filter-year" className="filter-field-label">
            Year
          </label>
          <select
            id="filter-year"
            name="year"
            defaultValue={params.year || ""}
            className="filter-select"
          >
            <option value="">All Years</option>
            {options.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Country Select */}
        <div className="filter-field">
          <label htmlFor="filter-country" className="filter-field-label">
            Country
          </label>
          <select
            id="filter-country"
            name="country"
            defaultValue={params.country || ""}
            className="filter-select"
          >
            <option value="">All Countries</option>
            {options.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Select */}
        <div className="filter-field">
          <label htmlFor="filter-sort" className="filter-field-label">
            Sort
          </label>
          <select
            id="filter-sort"
            name="sort"
            defaultValue={params.sort}
            className="filter-select"
          >
            {params.q ? <option value="relevance">Relevance</option> : null}
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        <button type="submit" className="btn btn-secondary filter-submit-btn">
          Filter
        </button>
      </div>

      {/* Preserve Tag param if present */}
      {params.tag && <input type="hidden" name="tag" value={params.tag} />}
    </Form>
  );
}

export function FilterChipsBar({
  chips,
  clearAllUrl,
}: {
  chips: FilterChip[];
  clearAllUrl?: string;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="filter-chips-container" aria-label="Active filters">
      <span className="chips-label">Active filters:</span>
      <div className="chips-list">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            to={chip.removeUrl}
            className="filter-chip"
            title={`Remove ${chip.label}`}
          >
            <span>{chip.label}</span>
            <span className="chip-remove-icon" aria-hidden="true">
              ×
            </span>
          </Link>
        ))}
        {clearAllUrl && chips.length > 1 && (
          <Link to={clearAllUrl} className="clear-all-chips">
            Clear all
          </Link>
        )}
      </div>
    </div>
  );
}

export function SearchPagination({
  currentPage,
  totalPages,
  url,
}: {
  currentPage: number;
  totalPages: number;
  url: URL;
}) {
  if (totalPages <= 1) return null;

  const prevUrl = buildPaginationUrl(url, currentPage - 1);
  const nextUrl = buildPaginationUrl(url, currentPage + 1);

  return (
    <nav className="pagination-wrap" aria-label="Search pagination">
      {currentPage > 1 ? (
        <Link to={prevUrl} className="pagination-btn">
          ← Previous
        </Link>
      ) : (
        <span className="pagination-btn disabled" aria-disabled="true">
          ← Previous
        </span>
      )}

      <span className="pagination-info">
        Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link to={nextUrl} className="pagination-btn">
          Next →
        </Link>
      ) : (
        <span className="pagination-btn disabled" aria-disabled="true">
          Next →
        </span>
      )}
    </nav>
  );
}

