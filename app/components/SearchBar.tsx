import { Form, useNavigate } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";

interface SuggestionBrand {
  id: string;
  name: string;
  slug: string;
}

interface SuggestionAgency {
  id: string;
  name: string;
  slug: string;
  verified: boolean;
}

interface SuggestionAd {
  id: string;
  title: string;
  brand: {
    name: string;
  };
}

interface SuggestionData {
  brands: SuggestionBrand[];
  agencies: SuggestionAgency[];
  ads: SuggestionAd[];
}

interface FlatItem {
  type: "brand" | "agency" | "ad";
  title: string;
  subtitle?: string;
  url: string;
}

export function SearchBar({
  defaultValue = "",
  placeholder = "Search campaigns, brands, agencies...",
  className = "",
}: {
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(defaultValue);
  const [data, setData] = useState<SuggestionData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Flatten items for unified keyboard navigation
  const flatItems: FlatItem[] = [];
  if (data) {
    for (const b of data.brands) {
      flatItems.push({
        type: "brand",
        title: b.name,
        subtitle: "Brand",
        url: `/brands/${b.slug}`,
      });
    }
    for (const a of data.agencies) {
      flatItems.push({
        type: "agency",
        title: a.name,
        subtitle: a.verified ? "Agency • Verified" : "Agency",
        url: `/agencies/${a.slug}`,
      });
    }
    for (const ad of data.ads) {
      flatItems.push({
        type: "ad",
        title: ad.title,
        subtitle: ad.brand.name,
        url: `/ads/${ad.id}`,
      });
    }
  }

  // Debounced search-suggest fetch
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setData(null);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-suggest?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setIsOpen(
            Boolean(
              json.brands?.length || json.agencies?.length || json.ads?.length
            )
          );
          setActiveIndex(-1);
        }
      } catch (err) {
        // Ignore fetch errors, fallback to native submit
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || flatItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1 < flatItems.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : flatItems.length - 1));
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (e.key === "Enter" && activeIndex >= 0 && activeIndex < flatItems.length) {
      e.preventDefault();
      const item = flatItems[activeIndex];
      setIsOpen(false);
      navigate(item.url);
    }
  };

  return (
    <div ref={wrapperRef} className={`search-bar-wrapper ${className}`}>
      <Form
        method="get"
        action="/search"
        className="search-bar-form"
        role="search"
      >
        <div
          className="search-bar-input-wrap"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls="search-suggestions-listbox"
        >
          <svg
            className="search-bar-icon"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M13 13l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (flatItems.length > 0) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="search-bar-input"
            autoComplete="off"
            aria-autocomplete="list"
          />
        </div>
      </Form>

      {isOpen && flatItems.length > 0 && (
        <ul
          id="search-suggestions-listbox"
          className="search-suggestions-dropdown"
          role="listbox"
        >
          {data?.brands && data.brands.length > 0 && (
            <li className="suggestion-category" role="presentation">
              <span className="category-label">Brands</span>
              {data.brands.map((b) => {
                const itemIndex = flatItems.findIndex((it) => it.url === `/brands/${b.slug}`);
                const isSelected = activeIndex === itemIndex;
                return (
                  <div
                    key={`brand-${b.id}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`suggestion-item ${isSelected ? "selected" : ""}`}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    onClick={() => {
                      setIsOpen(false);
                      navigate(`/brands/${b.slug}`);
                    }}
                  >
                    <span className="suggestion-title">{b.name}</span>
                    <span className="suggestion-tag">Brand</span>
                  </div>
                );
              })}
            </li>
          )}

          {data?.agencies && data.agencies.length > 0 && (
            <li className="suggestion-category" role="presentation">
              <span className="category-label">Agencies</span>
              {data.agencies.map((a) => {
                const itemIndex = flatItems.findIndex((it) => it.url === `/agencies/${a.slug}`);
                const isSelected = activeIndex === itemIndex;
                return (
                  <div
                    key={`agency-${a.id}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`suggestion-item ${isSelected ? "selected" : ""}`}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    onClick={() => {
                      setIsOpen(false);
                      navigate(`/agencies/${a.slug}`);
                    }}
                  >
                    <span className="suggestion-title">{a.name}</span>
                    <span className="suggestion-tag">
                      {a.verified ? "Agency • Verified" : "Agency"}
                    </span>
                  </div>
                );
              })}
            </li>
          )}

          {data?.ads && data.ads.length > 0 && (
            <li className="suggestion-category" role="presentation">
              <span className="category-label">Campaigns</span>
              {data.ads.map((ad) => {
                const itemIndex = flatItems.findIndex((it) => it.url === `/ads/${ad.id}`);
                const isSelected = activeIndex === itemIndex;
                return (
                  <div
                    key={`ad-${ad.id}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`suggestion-item ${isSelected ? "selected" : ""}`}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    onClick={() => {
                      setIsOpen(false);
                      navigate(`/ads/${ad.id}`);
                    }}
                  >
                    <span className="suggestion-title">{ad.title}</span>
                    <span className="suggestion-tag">{ad.brand.name}</span>
                  </div>
                );
              })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

