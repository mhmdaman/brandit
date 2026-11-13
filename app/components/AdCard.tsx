import { useState } from "react";
import { Link } from "@remix-run/react";
import { BookmarkButton } from "./BookmarkButton";

export interface AdCardProps {
  ad: {
    id: string;
    title: string;
    platform: string;
    externalId: string | null;
    imageUrl: string | null;
    featuredAt?: string | Date | null;
    track?: string;
    school?: string | null;
    course?: string | null;
    brand: {
      name: string;
      slug: string;
    };
    org: {
      name: string;
      slug: string;
    };
  };
  isBookmarked?: boolean;
  isLoggedIn?: boolean;
}

export function AdCard({ ad, isBookmarked = false, isLoggedIn = false }: AdCardProps) {
  const [imgError, setImgError] = useState(false);

  // Determine thumbnail URL
  let thumbnailUrl: string | null = null;
  if (ad.imageUrl) {
    thumbnailUrl = ad.imageUrl;
  } else if (ad.platform === "YOUTUBE" && ad.externalId) {
    thumbnailUrl = `https://i.ytimg.com/vi/${ad.externalId}/hqdefault.jpg`;
  }

  return (
    <article className="ad-card" id={`ad-card-${ad.id}`}>
      <div className="ad-card-thumb-wrap">
        <Link to={`/ads/${ad.id}`} className="ad-card-thumb-link" tabIndex={-1} aria-hidden="true">
          {thumbnailUrl && !imgError ? (
            <img
              src={thumbnailUrl}
              alt={ad.title}
              className="ad-card-thumb"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="thumb-placeholder">{ad.platform || ad.brand.name}</div>
          )}

          {ad.featuredAt && (
            <span className="badge-featured" title="Featured Campaign">
              ★ Featured
            </span>
          )}

          {ad.track === "STUDENT" && (
            <span className="badge-student" title={ad.school ? `Student work: ${ad.school}` : "Student Work"}>
              Student
            </span>
          )}

          <span className="badge-platform">{ad.platform}</span>
        </Link>

        {/* Bookmark overlay button */}
        <BookmarkButton
          adId={ad.id}
          isBookmarked={isBookmarked}
          isLoggedIn={isLoggedIn}
          className="ad-card-bookmark"
        />
      </div>

      <div className="ad-card-body">
        <h3 className="ad-card-title">
          <Link to={`/ads/${ad.id}`}>{ad.title}</Link>
        </h3>

        <div className="ad-card-meta">
          <div className="ad-card-brand-row">
            <Link to={`/brands/${ad.brand.slug}`} className="ad-card-brand">
              {ad.brand.name}
            </Link>
          </div>
          <div className="ad-card-agency">
            <span>By</span>
            <Link to={`/agencies/${ad.org.slug}`}>{ad.org.name}</Link>
          </div>
          {ad.track === "STUDENT" && ad.school && (
            <div className="ad-card-school" title={ad.course ? `${ad.school} - ${ad.course}` : ad.school}>
              <span>🎓 {ad.school}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
