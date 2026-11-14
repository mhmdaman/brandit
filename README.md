# Brandit — Ad Gallery Platform

A minimal, high-aesthetic gallery of advertising campaigns grouped by brand and posting creative agency, brand, or independent creator.

Built strictly with **Remix (Vite)**, **TypeScript**, **Prisma ORM**, **PostgreSQL**, and a single vanilla **CSS** stylesheet. No external authentication libraries, no UI component libraries, and no third-party validation frameworks.

---

## Table of Contents

1. [Architectural Philosophy](#architectural-philosophy)
2. [How It Works (System Architecture & Mechanics)](#how-it-works-system-architecture--mechanics)
   - [Authentication & Sessions (Phase 2)](#1-authentication--sessions)
   - [Rate Limiting (Phases 2 & 3)](#2-rate-limiting)
   - [Onboarding & Slug Generation (Phase 2)](#3-onboarding--slug-generation)
   - [URL Normalization & Duplicate Prevention (Phases 2 & 3)](#4-url-normalization--duplicate-prevention)
   - [Brand & Product Autocomplete (Phase 2)](#5-brand--product-autocomplete)
   - [Ad Submission & Lifecycle Workflow (Phases 2 & 3)](#6-ad-submission--lifecycle-workflow)
   - [Owner Dashboard & Strict Authorization (Phase 2)](#7-owner-dashboard--strict-authorization)
   - [Admin Moderation, Brand Merging & Reports (Phase 2)](#8-admin-moderation-brand-merging--reports)
   - [PostgreSQL Full-Text & Trigram Search Engine (Phase 3)](#9-postgresql-full-text--trigram-search-engine)
   - [Live Search Suggestions & Autocomplete (Phase 3)](#10-live-search-suggestions--autocomplete)
   - [Student & Professional Tracks (Phase 3)](#11-student--professional-tracks)
   - [Optimistic Bookmarks & N+1 Prevention (Phase 3)](#12-optimistic-bookmarks--n1-prevention)
   - [Multi-Platform Video Embeds & SSRF-Safe oEmbed (Phase 3)](#13-multi-platform-video-embeds--ssrf-safe-oembed)
   - [Security Architecture & Content Security Policy (All Phases)](#14-security-architecture--content-security-policy)
3. [How to Use (Getting Started)](#how-to-use-getting-started)
   - [Prerequisites](#prerequisites)
   - [Environment Configuration](#environment-configuration)
   - [Creating the First Administrator](#creating-the-first-administrator)
   - [Database Migrations & Seeding](#database-migrations--seeding)
   - [Running the Development Server](#running-the-development-server)
   - [Building for Production](#building-for-production)
4. [Phase 2 Manual Verification Checklist](#phase-2-manual-verification-checklist)
   - [Test 1: Registration -> Onboarding -> Profile Created](#test-1-registration---onboarding---profile-created)
   - [Test 2: Submit a YouTube Ad with a NEW Brand](#test-2-submit-a-youtube-ad-with-a-new-brand)
   - [Test 3: Submit Duplicate URL with Tracking Params](#test-3-submit-duplicate-url-with-tracking-params)
   - [Test 4: Admin Approval Workflow](#test-4-admin-approval-workflow)
   - [Test 5: Rejection with Custom Moderation Reason](#test-5-rejection-with-custom-moderation-reason)
   - [Test 6: Cross-Organization Edit Protection](#test-6-cross-organization-edit-protection)
   - [Test 7: Login Rate Limiting (6 Failed Logins)](#test-7-login-rate-limiting-6-failed-logins)
   - [Test 8: Brand Consolidation (Merge Tool)](#test-8-brand-consolidation-merge-tool)
5. [Phase 3 Manual Verification Checklist](#phase-3-manual-verification-checklist)
   - [Test 1: Full-Text and Typo-Tolerant Search](#test-1-full-text-and-typo-tolerant-search)
   - [Test 2: Multi-Criteria Filter Controls & Removable Chips](#test-2-multi-criteria-filter-controls--removable-chips)
   - [Test 3: Accessible Header Search Combobox & Suggestions](#test-3-accessible-header-search-combobox--suggestions)
   - [Test 4: Preserved Pagination Across Filters](#test-4-preserved-pagination-across-filters)
   - [Test 5: Dedicated Professional & Student Feeds](#test-5-dedicated-professional--student-feeds)
   - [Test 6: Student Work Submission & School Validation](#test-6-student-work-submission--school-validation)
   - [Test 7: Student Badges & Admin Moderation Notes](#test-7-student-badges--admin-moderation-notes)
   - [Test 8: Optimistic Bookmark Button & Auth Redirect](#test-8-optimistic-bookmark-button--auth-redirect)
   - [Test 9: Saved Campaigns Page (/me/bookmarks) & N+1 Prevention](#test-9-saved-campaigns-page-mebookmarks--n1-prevention)
   - [Test 10: Multi-Platform Embeds, Facades & Fallback Link Cards](#test-10-multi-platform-embeds-facades--fallback-link-cards)

---

## Architectural Philosophy

- **Zero External Auth Libraries**: Built using native Node.js `crypto` (`scrypt`, `randomBytes`, `timingSafeEqual`) and Remix's built-in `createCookieSessionStorage`.
- **Zero UI / Component Frameworks**: Clean, responsive layout crafted in vanilla CSS ([`app/styles.css`](file:///Users/muhammedaman/Desktop/brandit/app/styles.css)) featuring CSS custom properties, dark-mode support via `prefers-color-scheme`, responsive grids, and embed facades.
- **Zero Validation Libraries**: Strict manual validation on both client and server.
- **Zero File Upload Dependencies**: Third-party poster images and logo links are pasted as external URLs. Third-party video embeds use lightweight click-to-load thumbnail facades (no external iframes load until the user clicks play).
- **Zero Raw SQL Injection Risk**: All search queries use Prisma's parameterized `$queryRaw` with `Prisma.sql` fragments. Zero string concatenation into SQL.
- **Security by Design**: Strictly relative redirects, POST-only state mutations, server-enforced database ownership, and CSP frame protection.

---

## How It Works (System Architecture & Mechanics)

### 1. Authentication & Sessions
- **Password Hashing** ([`app/utils/password.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/utils/password.server.ts)):
  Passwords are encrypted using Node's native `crypto.scrypt` with a fresh 16-byte random salt generated via `crypto.randomBytes(16)`. Hashes are stored as `saltHex:hashHex`. Verification uses `crypto.timingSafeEqual` with strict length guards to protect against timing attacks.
- **Session Storage** ([`app/session.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/session.server.ts)):
  Remix `createCookieSessionStorage` signs session cookies with `SESSION_SECRET` (the server fails fast at boot if missing). Cookies are configured with `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 30 days`, and `secure: true` in production.
- **Safe Redirections**:
  The `safeRedirect()` helper verifies that any requested `?redirectTo=` target starts with a single `/` and excludes protocol-relative `//` or backslash characters, mitigating open redirect vulnerabilities.

### 2. Rate Limiting
- Built as a sliding-window in-memory limiter in [`app/utils/rateLimit.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/utils/rateLimit.server.ts) with automatic garbage-collection:
  - **Login**: Max 5 failed attempts per 15 minutes per IP + email. Successful logins reset the counter.
  - **Register**: Max 5 registrations per hour per IP.
  - **Submit**: Max 10 ad submissions per hour per user.
  - **Report**: Max 5 takedown reports per hour per IP.
  - **Bookmark**: Max 60 bookmark operations per hour per user.
  - **Search Suggest**: Max 60 suggestion requests per minute per IP.
  - Exceeded thresholds return HTTP `429 Too Many Requests`.

### 3. Onboarding & Slug Generation
- Newly registered accounts are required to complete onboarding ([`/onboarding`](file:///Users/muhammedaman/Desktop/brandit/app/routes/onboarding.tsx)) before submitting work.
- Users choose an organization type (`AGENCY`, `CREATOR`, `BRAND`) and supply location, bio, website, and logo URL.
- Slugs are generated via `slugify()` ([`app/utils/slugify.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/utils/slugify.server.ts)) which decomposes diacritics using Unicode NFD, strips accents, lowercases, and replaces non-alphanumerics with hyphens. Slug collisions are automatically resolved with `-2`, `-3`, etc.
- The organization record and user association are committed in a single atomic database transaction. Organization slugs remain immutable to prevent breaking published URLs.

### 4. URL Normalization & Duplicate Prevention
- Normalization in [`app/utils/url.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/utils/url.server.ts) strips all marketing and tracking query parameters (`utm_*`, `fbclid`, `igshid`, `gclid`, `mc_cid`, `_ga`), lowercases the hostname, and trims trailing slashes.
- Canonicalization handles:
  - **YouTube**: Canonicalizes watch URLs, Shorts, and shortlinks (`youtu.be`) to `https://www.youtube.com/watch?v={id}`.
  - **Vimeo**: Canonicalizes to `https://vimeo.com/{id}` or preserves unlisted hash `https://vimeo.com/{id}/{hash}`.
  - **TikTok**: Resolves shortlinks (`vm.tiktok.com`, `vt.tiktok.com`, `tiktok.com/t/`) via server-side redirect checks (max 2 hops) to standard `https://www.tiktok.com/@user/video/{id}`.
  - **Instagram**: Strips tracking and normalizes posts, reels, and TV URLs.
- Submissions check for duplicate canonical URLs. If an ad already exists in `APPROVED` status, the submission form displays an alert linking directly to the approved campaign.

### 5. Brand & Product Autocomplete
- Brand autocomplete operates via a lightweight resource route [`/api/brands?q=`](file:///Users/muhammedaman/Desktop/brandit/app/routes/api.brands.ts) returning up to 8 case-insensitive matches as JSON.
- The submission form attaches a `<datalist>` populated via progressive enhancement fetch.
- If JavaScript is disabled, the form functions natively: typing an unlisted brand or product name prompts the server to search by slug first (preventing duplicates like `"Nike"`, `"NIKE"`, and `"Nike "`) and create the record if it does not yet exist.

### 6. Ad Submission & Lifecycle Workflow
1. **Creation**: Submissions require an active user session linked to an organization. `orgId` is extracted strictly from the authenticated user's session record (never from form data).
2. **Pending Queue**: New ads are saved with status `PENDING`. They do not appear on the home page, brand pages, agency directories, or search results.
3. **Approval**: An administrator or editor reviews the ad. Approval transitions the status to `APPROVED`, publishing it across the site.
4. **Rejection**: If rejected, an administrator can store a custom reason in `Ad.rejectionReason`, which is displayed in the owner's dashboard.
5. **Re-Review Trigger**: If an owner edits an already `APPROVED` ad, its status is automatically reset to `PENDING` so modifications are re-moderated before returning to public view.

```
       [Submit Ad]
            │
            ▼
       ( PENDING ) ──────── ( Admin Rejects ) ──────► ( REJECTED )
            │                                              │
     ( Admin Approves )                                    │ (Owner edits)
            │                                              │
            ▼                                              ▼
       ( APPROVED ) ─── (Owner edits ad) ────────────► ( PENDING )
```

### 7. Owner Dashboard & Strict Authorization
- Route [`/dashboard`](file:///Users/muhammedaman/Desktop/brandit/app/routes/dashboard._index.tsx) displays the user's organization profile, verified badge, and submissions table.
- Submissions display status badges (`● Pending Review`, `✓ Approved`, `✕ Rejected` with reason).
- Ownership check `ad.orgId === user.orgId` is enforced on both `loader` and `action` in [`app/routes/dashboard.ads.$id.edit.tsx`](file:///Users/muhammedaman/Desktop/brandit/app/routes/dashboard.ads.$id.edit.tsx). Unauthorized attempts return HTTP `403 Forbidden`.

### 8. Admin Moderation, Brand Merging & Reports
- **Pending Review Queue** ([`/admin/review`](file:///Users/muhammedaman/Desktop/brandit/app/routes/admin.review.tsx)):
  Accessible to `ADMIN` and `EDITOR` roles. Lists submissions oldest-first with embed previews, metadata pills, student notes, and actions to Approve, Reject, Feature/Unfeature, or toggle `Organization.verified`.
- **All Campaigns Index** ([`/admin/ads`](file:///Users/muhammedaman/Desktop/brandit/app/routes/admin.ads.tsx)):
  Searchable index with status filters and inline status switchers.
- **Brand Consolidation** ([`/admin/brands`](file:///Users/muhammedaman/Desktop/brandit/app/routes/admin.brands.tsx)):
  Restricted to `ADMIN` only. In a single Prisma `$transaction`, transfers all ads and products from a duplicate source brand to a target brand, resolves duplicate product slugs, and deletes the duplicate brand.
- **Takedown Process** ([`/admin/reports`](file:///Users/muhammedaman/Desktop/brandit/app/routes/admin.reports.tsx)):
  Public visitors can submit takedown reports via `/ads/$id`. Moderators can review reasons and either dismiss the report or reject and takedown the campaign.

### 9. PostgreSQL Full-Text & Trigram Search Engine
- Implemented in [`app/utils/search.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/utils/search.server.ts) using `prisma.$queryRaw` with `Prisma.sql` parameterized fragments.
- **Postgres Search Architecture**:
  - `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  - GIN Index on `to_tsvector('simple', title || ' ' || coalesce(description, ''))` on table `Ad`.
  - GIN Trigram indexes (`gin_trgm_ops`) on `Ad.title`, `Brand.name`, and `Organization.name`.
- **Dual Matching & Typo Tolerance**:
  - Matches against ad title, description, brand name, agency name, and tags.
  - Combines full-text search (`websearch_to_tsquery('simple', q)`) with trigram similarity (`%` operator and `similarity()` function). Typo queries like `"cocacola"` or `"nikee"` match relevant campaigns seamlessly.
- **Ranking & Sorting**:
  - Ranked by combined full-text rank score plus trigram similarity score, tie-breaking by `featuredAt desc`, then `createdAt desc`.
  - Sort modes: `relevance` (default when `q` is present), `newest`, and `oldest`.
- **Multi-Filter Support**:
  - Validates and filters by `medium`, `track`, `year`, `country`, `platform`, and `tag`.
  - Paginated at 24 items per page (`?page=`) with total count and preserved query parameters.
  - Search page includes `<meta name="robots" content="noindex, follow" />` to prevent indexing dynamic filter result variations.

### 10. Live Search Suggestions & Autocomplete
- Resource route [`/api/search-suggest?q=`](file:///Users/muhammedaman/Desktop/brandit/app/routes/api.search-suggest.ts) provides instant suggestions for brands, agencies, and ads.
- Minimum 2 characters, rate limited to 60 req/min per IP.
- Frontend combobox component [`app/components/SearchBar.tsx`](file:///Users/muhammedaman/Desktop/brandit/app/components/SearchBar.tsx):
  - 200ms debounce.
  - Full WAI-ARIA combobox attributes (`aria-expanded`, `aria-autocomplete="list"`, `aria-activedescendant`).
  - Keyboard navigation: `ArrowDown`, `ArrowUp`, `Enter`, and `Escape`.
  - Progressive enhancement: gracefully falls back to native GET form submission if JavaScript is disabled.

### 11. Student & Professional Tracks
- Dedicated curated feeds:
  - [`/professional`](file:///Users/muhammedaman/Desktop/brandit/app/routes/professional.tsx): preset to `Track.PROFESSIONAL`.
  - [`/student`](file:///Users/muhammedaman/Desktop/brandit/app/routes/student.tsx): preset to `Track.STUDENT`.
- Submission form progressive disclosure:
  - When track is `STUDENT`, `school` is mandatory (2–120 characters) and `course` is optional (max 120 characters).
  - When track is `PROFESSIONAL`, student fields are cleared and hidden.
- UI Badges:
  - Student work displays `🎓 Student Work: [School] — [Course]` badge on `AdCard` and ad detail pages.
- Admin Review:
  - Submissions display track, school, and course in the moderation queue with an explicit reminder: *"Student submissions: verify the school exists before approving."*

### 12. Optimistic Bookmarks & N+1 Prevention
- Resource route [`/api/bookmark`](file:///Users/muhammedaman/Desktop/brandit/app/routes/api.bookmark.ts) (POST only):
  - Body: `adId`, `intent: "add" | "remove"`.
  - Requires authentication. Unauthenticated requests return HTTP 401 JSON triggering client redirection to `/login?redirectTo=...`.
  - Idempotent execution using Prisma `upsert` and `deleteMany`.
  - Sliding-window rate limit: max 60 operations/hour per user.
- Interactive component [`app/components/BookmarkButton.tsx`](file:///Users/muhammedaman/Desktop/brandit/app/components/BookmarkButton.tsx):
  - Uses Remix `useFetcher` with optimistic state toggle.
  - Full accessibility (`aria-pressed`, dynamic accessible labels).
  - Progressive enhancement: works with native `<Form method="post">` without JS.
- N+1 Query Elimination:
  - Listings batch query the user's bookmarks in a single query: `getUserBookmarkedSet(userId, pageAdIds)`. Logged-out visitors bypass bookmark queries entirely.
- User Saved Feed:
  - Dedicated route [`/me/bookmarks`](file:///Users/muhammedaman/Desktop/brandit/app/routes/me.bookmarks.tsx) lists saved approved ads, sorted newest bookmark first.

### 13. Multi-Platform Video Embeds & SSRF-Safe oEmbed
- Supported Platforms: `YOUTUBE`, `TIKTOK`, `INSTAGRAM`, `FACEBOOK`, `VIMEO`, and `OTHER`.
- Exact Embed Iframe Sources in [`app/components/AdEmbed.tsx`](file:///Users/muhammedaman/Desktop/brandit/app/components/AdEmbed.tsx):
  - **YouTube**: `https://www.youtube-nocookie.com/embed/{id}`
  - **TikTok**: `https://www.tiktok.com/embed/v2/{videoId}` (portrait centered aspect ratio)
  - **Instagram**: `https://www.instagram.com/{type}/{shortcode}/embed` (responsive portrait box)
  - **Facebook**: `https://www.facebook.com/plugins/video.php?href={encodeURIComponent(url)}` or post plugin
  - **Vimeo**: `https://player.vimeo.com/video/{id}?dnt=1`
- Privacy & Facades:
  - Click-to-load facade pattern: no external scripts or iframes load until the user clicks play.
  - Notice rendered under every facade: *"Loads content from [Platform]."*
  - Source attribution bar beneath every embed with direct link to platform and domain name.
  - Graceful fallback link card rendered if an external ID cannot be embedded.
- SSRF-Safe oEmbed Fetcher ([`app/utils/oembed.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/utils/oembed.server.ts)):
  - Best-effort server-side thumbnail retrieval for TikTok and Vimeo.
  - Hardcoded trusted domains only (no user-supplied hosts).
  - 3-second timeout via `AbortController`. Failures fail open without blocking submission.

### 14. Security Architecture & Content Security Policy
- **State Changes**: Every mutation is an HTTP `POST` action. No state changes occur on `GET`.
- **Content Rendering**: All user text is rendered through React JSX (no `dangerouslySetInnerHTML`).
- **External Links**: Links specify `rel="noopener noreferrer"`. User URLs are validated via `isValidHttpUrl()` to ensure they only start with `http://` or `https://`.
- **Security Headers & CSP** in [`app/entry.server.tsx`](file:///Users/muhammedaman/Desktop/brandit/app/entry.server.tsx):
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy`:
    - `frame-src 'self' https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https://www.facebook.com https://player.vimeo.com;`
    - `img-src 'self' data: https:;`

---

## How to Use (Getting Started)

### Prerequisites
- Node.js >= 20.0.0
- npm
- PostgreSQL database instance (or Supabase)

### Environment Configuration
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and configure:
   ```env
   # PostgreSQL connection strings
   DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

   # Remix Session Secret (at least 32 random characters)
   SESSION_SECRET="e92fb6c91a0c71a39641d40a23e981fc1e9a3b9042b4d8e8"

   # Admin User Credentials (used by seed script)
   ADMIN_EMAIL="admin@brandit.test"
   ADMIN_PASSWORD="super-admin-password-123"
   ```

### Creating the First Administrator
The seed script will automatically create or update an administrator account matching `ADMIN_EMAIL` and `ADMIN_PASSWORD`:
```bash
npm run db:seed
```
If these variables are omitted from `.env`, admin seeding is safely skipped.

### Database Migrations & Seeding
```bash
# Run Prisma migrations to set up the database schema and pg_trgm search indexes
npm run db:migrate

# Seed agencies, brands, products, tags, initial ads (including student & Vimeo/TikTok work), and admin
npm run db:seed
```

### Running the Development Server
```bash
npm run dev
```
Open your browser at **[http://localhost:5173](http://localhost:5173)**.

### Building for Production
```bash
# Typecheck TypeScript files
npm run typecheck

# Build the Remix client and SSR server bundles
npm run build

# Start the production server
npm run start
```

---

## Phase 2 Manual Verification Checklist

Follow these steps to manually verify all Phase 2 features:

### Test 1: Registration -> Onboarding -> Profile Created
1. Start the server (`npm run dev`) and navigate to `http://localhost:5173/register`.
2. Enter an email address (`creator@example.com`), password (`password123`), and confirm password. Click **Create Account**.
3. Verify you are automatically redirected to `/onboarding`.
4. Enter Profile details:
   - Organization Name: `"Lighthouse Creative"`
   - Type: `"Agency"`
   - Country: `"United Kingdom"`
   - Website: `"https://lighthouse.example.com"`
   - Bio: `"Independent boutique creative studio."`
5. Click **Save & Continue to Dashboard**.
6. Verify you land on `/dashboard`, displaying your agency name, country, website link, and an empty submissions table.

### Test 2: Submit a YouTube Ad with a NEW Brand
1. Click **Submit** in the main navigation header (`/submit`).
2. Paste the media URL: `https://www.youtube.com/watch?v=Fq2CvmgoO7I`.
3. Verify that the **Live Preview** box renders the YouTube facade preview with video thumbnail.
4. Fill in the required fields:
   - Campaign Title: `"Dream Beyond Limits"`
   - Brand Name: `"Apex Athletics"` *(a brand that does not exist in the database)*
   - Product: `"Pro Runner"`
   - Year: `2024`
   - Country: `"United Kingdom"`
   - Medium: `"Video / TVC"`
   - Track: `"Professional Work"`
   - Tags: `"Sports, Inspirational, Running"`
5. Click **Submit Campaign for Review**.
6. Verify you are redirected to `/dashboard` with the notification banner: `"✓ Campaign submitted successfully! It is currently in review."`
7. In your submissions table, verify `"Dream Beyond Limits"` appears with status **● Pending Review**.
8. Navigate to `/` (Home), `/brands`, and `/brands/apex-athletics`: verify the pending campaign is **NOT visible** anywhere on public pages.

### Test 3: Submit Duplicate URL with Tracking Params
1. Return to `/submit`.
2. Enter the same YouTube video but with appended tracking and analytics parameters:
   `https://youtu.be/Fq2CvmgoO7I?utm_source=twitter&utm_medium=social&fbclid=xyz987`
3. Fill in the remaining required fields and click submit.
4. Verify the form is rejected with the field error:
   `"This campaign URL has already been submitted for review."`
   *(If the existing ad is approved, it displays a direct link to the approved campaign).*

### Test 4: Admin Approval Workflow
1. Click **Logout** in the header navigation.
2. Go to `/login` and sign in with the admin credentials configured in your `.env` (`admin@brandit.test` / `super-admin-password-123`).
3. Notice that the header navigation now includes an **Admin** link. Click it to navigate to `/admin/review`.
4. Find the `"Dream Beyond Limits"` campaign in the queue.
5. Click **✓ Approve Ad**.
6. Open the public homepage `/`: verify `"Dream Beyond Limits"` is now displayed in the **Latest Campaigns** grid.
7. Open `/brands`: verify the new brand `"Apex Athletics"` is listed with 1 campaign.
8. Open `/agencies/lighthouse-creative`: verify the approved ad is displayed under Lighthouse Creative's profile.

### Test 5: Rejection with Custom Moderation Reason
1. Submit another ad campaign as a regular user (e.g. Title: `"Broken Video Spec"` with URL `https://www.youtube.com/watch?v=45mMioJ5szc`).
2. Log back in as admin and visit `/admin/review`.
3. Under the campaign card, locate the rejection form and enter:
   `"Video resolution is below quality standards. Please provide high-definition link."`
4. Click **✕ Reject**.
5. Switch back to the submitting user's `/dashboard`.
6. Verify the ad now displays the red status badge **✕ Rejected** with the rejection text:
   `Reason: Video resolution is below quality standards. Please provide high-definition link.`
7. Click **Edit** next to the rejected ad: verify the previous rejection reason is displayed, and saving edits resets the status back to **PENDING**.

### Test 6: Cross-Organization Edit Protection
1. Log in as User A (`orgId_A`).
2. From `/dashboard`, hover over or click **Edit** on one of User A's ads and copy the URL (e.g., `/dashboard/ads/ad_12345/edit`).
3. Click **Logout**.
4. Log in as User B (`orgId_B`).
5. Paste the copied URL (`/dashboard/ads/ad_12345/edit`) directly into your browser address bar and hit enter.
6. Verify access is blocked with HTTP **403 Forbidden** (`"Forbidden: You do not have permission to edit this campaign"`).

### Test 7: Login Rate Limiting (6 Failed Logins)
1. Open an Incognito / Private browsing window and navigate to `/login`.
2. Enter an email address (`victim@example.com`) and an intentionally incorrect password (`wrongpass1`). Click **Sign In**.
3. Repeat 4 more times (5 total failed attempts). Each attempt will show `"Invalid email or password."`
4. Attempt to sign in a 6th time.
5. Verify the request is immediately blocked with HTTP **429**:
   `"Too many failed login attempts. Please wait 15 minutes before trying again."`

### Test 8: Brand Consolidation (Merge Tool)
1. Log in as an administrator (`role: ADMIN`) and navigate to `/admin/brands`.
2. Verify the two-column interface: **Consolidate Duplicate Brands** on the left and **All Brands** on the right.
3. Select a duplicate brand (e.g. `"Apex Athletics"`) in **Duplicate Brand to Delete (Source)**.
4. Select a canonical brand (e.g. `"Nike"`) in **Canonical Brand to Keep (Target)**.
5. Click **Merge Brands into Canonical** and confirm the browser alert.
6. Verify the success message: `"✓ Brands merged successfully! All associated campaigns and products have been consolidated."`
7. Check the brands list: `"Apex Athletics"` is removed, and all campaigns previously belonging to it now appear under `"Nike"`.

---

## Phase 3 Manual Verification Checklist

Follow these steps to manually verify all Phase 3 features:

### Test 1: Full-Text and Typo-Tolerant Search
1. Open `http://localhost:5173/search`.
2. Type `"nike"` into the search box and press Enter: verify relevant Nike campaigns (e.g., *"Dream Crazier"*, *"You Can't Stop Us"*) appear in the results.
3. Intentionally introduce typos: search for `"nikee"` or `"cocacola"`:
4. Verify that PostgreSQL `pg_trgm` similarity matching successfully matches and ranks the campaigns.
5. Check page source: verify `<meta name="robots" content="noindex, follow" />` is present on `/search`.

### Test 2: Multi-Criteria Filter Controls & Removable Chips
1. On `/search`, select **Medium: Video / TVC**, **Year: 2024**, and select a **Country**. Click **Filter Results**.
2. Verify active filter chips appear above the results grid with labels (e.g., `Medium: VIDEO`, `Year: 2024`).
3. Click the `×` button on the `Year` chip: verify the page reloads retaining the medium and country filters while removing the year constraint.
4. Verify the search form works fully without JavaScript enabled (pure GET form).

### Test 3: Accessible Header Search Combobox & Suggestions
1. In the header search bar on any page, type `"nik"`.
2. Verify the suggestions dropdown opens after a 200ms debounce displaying matching brands (Nike), campaigns, or agencies.
3. Use keyboard navigation (`ArrowDown` and `ArrowUp`) to highlight items. Press `Enter` to navigate to the selected suggestion.
4. Press `Escape` and verify the dropdown closes immediately.

### Test 4: Preserved Pagination Across Filters
1. Perform a search or browse with filters that returns more than 24 results (or navigate to `/search`).
2. Click **Next →** in the pagination controls at the bottom of the grid.
3. Verify that the URL updates to `?page=2` and all active query parameters (`q`, `medium`, `track`, `year`, `country`, `sort`) are preserved in the URL.
4. Click **← Previous** and verify you return to page 1.

### Test 5: Dedicated Professional & Student Feeds
1. Click **Professional** in the header navigation (`/professional`):
   - Verify all displayed campaigns have track `PROFESSIONAL`.
   - Verify the filter form presets the track and hides the redundant track dropdown.
2. Click **Student** in the header navigation (`/student`):
   - Verify all displayed campaigns have track `STUDENT`.
   - Verify student work badges appear on the cards.

### Test 6: Student Work Submission & School Validation
1. Log in and navigate to `/submit`.
2. Change the **Track** dropdown from `"Professional Work"` to `"Student / Spec Work"`.
3. Notice that the **School / University** and **Course / Degree** fields appear.
4. Attempt to submit with School blank: verify the form displays the validation error: `"School name is required for student submissions."`
5. Enter a valid school (e.g., `"Miami Ad School"`) and course (e.g., `"Art Direction"`), complete the required fields, and submit.
6. Verify the ad is submitted to the pending queue with school and course attached.

### Test 7: Student Badges & Admin Moderation Notes
1. Log in as an administrator and navigate to `/admin/review`.
2. Locate the student campaign submitted in Test 6.
3. Verify the notice is displayed: `"Student submissions: verify the school exists before approving."`
4. Verify the track, school, and course are clearly visible in the submission details.
5. Click **Approve**. Navigate to the ad's public page (`/ads/{id}`): verify the badge `🎓 Student Work: Miami Ad School — Art Direction` is displayed.

### Test 8: Optimistic Bookmark Button & Auth Redirect
1. Ensure you are logged out (or use an incognito window).
2. Visit `/` or `/search` and click the bookmark icon on any campaign card.
3. Verify you are automatically redirected to `/login?redirectTo=...`.
4. Log in: verify you are returned to your previous page.
5. Click the bookmark icon: verify it optimistically toggles to filled state with `aria-pressed="true"` without a full page reload.

### Test 9: Saved Campaigns Page (/me/bookmarks) & N+1 Prevention
1. As a logged-in user with at least 2 saved campaigns, click **Saved** in the header navigation (`/me/bookmarks`).
2. Verify your saved campaigns are displayed in a responsive grid, ordered newest bookmark first.
3. Unbookmark one campaign from this page: verify it is removed from your saved list.
4. Verify via server query logs that ad listings use a single batch query (`getUserBookmarkedSet`) for the page's ad IDs, avoiding N+1 queries.

### Test 10: Multi-Platform Embeds, Facades & Fallback Link Cards
1. Open ads with different platforms:
   - **YouTube**: Verify click-to-load poster facade; clicking loads `youtube-nocookie.com`.
   - **Vimeo**: Verify 16:9 aspect ratio embed with `dnt=1`.
   - **TikTok**: Verify centered portrait container (~325x740 max).
   - **Instagram**: Verify portrait container with responsive embed.
   - **Facebook**: Verify Facebook plugin iframe loading with encoded URL.
2. Under every embed, verify the facade notice: `"Loads content from [Platform]."` and the attribution link: `"Open on [Platform] ↗"`.
3. For ads with invalid or expired external IDs, verify the embed gracefully falls back to the clean external link card.
