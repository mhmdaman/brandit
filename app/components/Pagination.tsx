import { Link, useSearchParams } from "@remix-run/react";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export function Pagination({ currentPage, totalPages }: PaginationProps) {
  const [searchParams] = useSearchParams();

  if (totalPages <= 1) {
    return null;
  }

  const createPageUrl = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", pageNumber.toString());
    return `?${params.toString()}`;
  };

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav className="pagination-wrap" aria-label="Pagination">
      {hasPrev ? (
        <Link
          to={createPageUrl(currentPage - 1)}
          className="pagination-btn"
          id="pagination-prev"
        >
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

      {hasNext ? (
        <Link
          to={createPageUrl(currentPage + 1)}
          className="pagination-btn"
          id="pagination-next"
        >
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
