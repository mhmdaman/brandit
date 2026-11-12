import { useState } from "react";

export interface AdEmbedProps {
  platform: string;
  externalId: string | null;
  url: string;
  title: string;
  imageUrl?: string | null;
}

export function AdEmbed({
  platform,
  externalId,
  url,
  title,
  imageUrl,
}: AdEmbedProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  // 1. YouTube with click-to-load thumbnail facade
  if (platform === "YOUTUBE" && externalId) {
    const posterUrl = imageUrl || `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg`;

    if (!isPlaying) {
      return (
        <div className="ad-media-container" id="ad-media-container">
          <button
            type="button"
            className="embed-facade"
            style={{ backgroundImage: `url(${posterUrl})` }}
            onClick={() => setIsPlaying(true)}
            aria-label={`Play video: ${title}`}
          >
            <div className="facade-play-btn" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        </div>
      );
    }

    return (
      <div className="ad-media-container" id="ad-media-container">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${externalId}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  // 2. Other platforms (TikTok, Instagram, Facebook, Other)
  // TODO: Add native embed SDK widgets or iframe renderers for TIKTOK, INSTAGRAM, and FACEBOOK in future phases
  return (
    <div className="ad-media-container" id="ad-media-container">
      <div className="external-embed-card">
        <h3>This ad is hosted on {platform}</h3>
        <p>Phase 1 embeds support YouTube directly. Click below to view the campaign on the host platform.</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-external-link"
        >
          Open on {platform} ↗
        </a>
      </div>
    </div>
  );
}
