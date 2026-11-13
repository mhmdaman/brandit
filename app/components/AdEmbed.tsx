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

  // Extract domain safely from the original URL
  let domain = "";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    domain = platform.toLowerCase();
  }

  const platformDisplayName =
    platform === "YOUTUBE"
      ? "YouTube"
      : platform === "TIKTOK"
      ? "TikTok"
      : platform === "INSTAGRAM"
      ? "Instagram"
      : platform === "FACEBOOK"
      ? "Facebook"
      : platform === "VIMEO"
      ? "Vimeo"
      : platform;

  // Render the bottom fallback / source attribution bar
  const renderSourceBar = () => (
    <div className="embed-source-bar">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="embed-source-link"
      >
        <span>Open on {platformDisplayName} ↗</span>
        <span className="embed-source-domain">({domain})</span>
      </a>
    </div>
  );

  // If externalId is missing or platform is OTHER, render the fallback link card only
  if (!externalId || platform === "OTHER") {
    return (
      <div className="ad-embed-wrapper">
        <div className="ad-media-container ad-media-link-card">
          <div className="external-embed-card">
            <span className="external-embed-badge">{platformDisplayName}</span>
            <h3>{title}</h3>
            <p>
              This campaign is hosted directly on {platformDisplayName}.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-external-link"
            >
              Open on {platformDisplayName} ↗
            </a>
          </div>
        </div>
        {renderSourceBar()}
      </div>
    );
  }

  // Determine poster URL for click-to-load facade
  let posterUrl: string | null = imageUrl || null;
  if (!posterUrl && platform === "YOUTUBE") {
    posterUrl = `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg`;
  }

  // Determine iframe source URL based on exact patterns specified
  let iframeSrc = "";
  let containerClass = "ad-media-16-9";
  let allowAttr = "fullscreen";

  if (platform === "YOUTUBE") {
    iframeSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(externalId)}?autoplay=1&rel=0`;
    containerClass = "ad-media-16-9";
    allowAttr = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
  } else if (platform === "VIMEO") {
    // externalId could be "12345" or "12345?h=hash"
    const separator = externalId.includes("?") ? "&" : "?";
    iframeSrc = `https://player.vimeo.com/video/${externalId}${separator}dnt=1&autoplay=1`;
    containerClass = "ad-media-16-9";
    allowAttr = "autoplay; fullscreen; picture-in-picture";
  } else if (platform === "TIKTOK") {
    iframeSrc = `https://www.tiktok.com/embed/v2/${encodeURIComponent(externalId)}`;
    containerClass = "ad-media-tiktok";
    allowAttr = "fullscreen; autoplay";
  } else if (platform === "INSTAGRAM") {
    // externalId is "<type>/<shortcode>" e.g. "reel/Cabc123"
    iframeSrc = `https://www.instagram.com/${externalId}/embed`;
    containerClass = "ad-media-instagram";
    allowAttr = "fullscreen";
  } else if (platform === "FACEBOOK") {
    // externalId is the normalised Facebook URL
    const isPost = externalId.includes("/posts/");
    if (isPost) {
      iframeSrc = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(externalId)}&show_text=true`;
    } else {
      iframeSrc = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(externalId)}&show_text=false&autoplay=1`;
    }
    containerClass = "ad-media-facebook";
    allowAttr = "autoplay; fullscreen";
  }

  return (
    <div className="ad-embed-wrapper">
      <div className={`ad-media-container ${containerClass}`} id="ad-media-container">
        {!isPlaying ? (
          <div className="facade-wrapper">
            <button
              type="button"
              className="embed-facade"
              style={posterUrl ? { backgroundImage: `url(${posterUrl})` } : undefined}
              onClick={() => setIsPlaying(true)}
              aria-label={`Play content: ${title}`}
            >
              <div className="facade-play-btn" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </button>
            <div className="facade-notice" aria-hidden="true">
              Loads content from {platformDisplayName}.
            </div>
          </div>
        ) : (
          <iframe
            src={iframeSrc}
            title={title}
            allow={allowAttr}
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
      {renderSourceBar()}
    </div>
  );
}
