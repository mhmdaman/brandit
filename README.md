# Brandit — Ad Gallery Platform

A minimal, high-aesthetic gallery of advertising campaigns grouped by brand and posting creative agency, brand, or independent creator.

Built strictly with **Remix (Vite)**, **TypeScript**, **Prisma ORM**, **PostgreSQL**, and a single vanilla **CSS** stylesheet. No external authentication libraries, no UI component libraries, and no third-party validation frameworks.

---

## Table of Contents

1. [Architectural Philosophy](#architectural-philosophy)
2. [How It Works (System Architecture & Mechanics)](#how-it-works-system-architecture--mechanics)
   - [Authentication & Sessions](#1-authentication--sessions)
   - [Rate Limiting](#2-rate-limiting)
   - [Onboarding & Slug Generation](#3-onboarding--slug-generation)
   - [URL Normalization & Duplicate Prevention](#4-url-normalization--duplicate-prevention)
   - [Brand & Product Autocomplete](#5-brand--product-autocomplete)
   - [Ad Submission & Lifecycle Workflow](#6-ad-submission--lifecycle-workflow)
   - [Owner Dashboard & Strict Authorization](#7-owner-dashboard--strict-authorization)
   - [Admin Moderation, Brand Merging & Reports](#8-admin-moderation-brand-merging--reports)
   - [Security Architecture](#9-security-architecture)
3. [How to Use (Getting Started)](#how-to-use-getting-started)
   - [Prerequisites](#prerequisites)
   - [Environment Configuration](#environment-configuration)
   - [Creating the First Administrator](#creating-the-first-administrator)
   - [Database Migrations & Seeding](#database-migrations--seeding)
   - [Running the Development Server](#running-the-development-server)
   - [Building for Production](#building-for-production)
4. [Manual Verification Checklist](#manual-verification-checklist)
   - [Test 1: Registration -> Onboarding -> Profile Created](#test-1-registration---onboarding---profile-created)
   - [Test 2: Submit a YouTube Ad with a NEW Brand](#test-2-submit-a-youtube-ad-with-a-new-brand)
   - [Test 3: Submit Duplicate URL with Tracking Params](#test-3-submit-duplicate-url-with-tracking-params)
   - [Test 4: Admin Approval Workflow](#test-4-admin-approval-workflow)
   - [Test 5: Rejection with Custom Moderation Reason](#test-5-rejection-with-custom-moderation-reason)
   - [Test 6: Cross-Organization Edit Protection](#test-6-cross-organization-edit-protection)
   - [Test 7: Login Rate Limiting (6 Failed Logins)](#test-7-login-rate-limiting-6-failed-logins)
   - [Test 8: Brand Consolidation (Merge Tool)](#test-8-brand-consolidation-merge-tool)

---

## Architectural Philosophy

- **Zero External Auth Libraries**: Built using native Node.js `crypto` (`scrypt`, `randomBytes`, `timingSafeEqual`) and Remix's built-in `createCookieSessionStorage`.
- **Zero UI / Component Frameworks**: Clean, responsive layout crafted in vanilla CSS ([`app/styles.css`](file:///Users/muhammedaman/Desktop/brandit/app/styles.css)) featuring CSS custom properties, dark-mode support via `prefers-color-scheme`, responsive grids, and embed facades.
- **Zero Validation Libraries**: Strict manual validation on both client and server.
- **Zero File Upload Dependencies**: Third-party poster images and logo links are pasted as external URLs. Third-party video embeds use lightweight click-to-load thumbnail facades (no external iframes load until the user clicks play).
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
  - Exceeded thresholds return HTTP `429 Too Many Requests`.

### 3. Onboarding & Slug Generation
- Newly registered accounts are required to complete onboarding ([`/onboarding`](file:///Users/muhammedaman/Desktop/brandit/app/routes/onboarding.tsx)) before submitting work.
- Users choose an organization type (`AGENCY`, `CREATOR`, `BRAND`) and supply location, bio, website, and logo URL.
- Slugs are generated via `slugify()` ([`app/utils/slugify.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/utils/slugify.server.ts)) which decomposes diacritics using Unicode NFD, strips accents, lowercases, and replaces non-alphanumerics with hyphens. Slug collisions are automatically resolved with `-2`, `-3`, etc.
- The organization record and user association are committed in a single atomic database transaction. Organization slugs remain immutable to prevent breaking published URLs.

### 4. URL Normalization & Duplicate Prevention
- Normalization in [`app/utils/url.server.ts`](file:///Users/muhammedaman/Desktop/brandit/app/utils/url.server.ts) strips all marketing and tracking query parameters (`utm_*`, `fbclid`, `igshid`, `gclid`, `mc_cid`, `_ga`), lowercases the hostname, and trims trailing slashes.
- YouTube links (`youtube.com/watch`, `youtu.be/`, `youtube.com/shorts/`, `embed/`) are canonicalized to standard `https://www.youtube.com/watch?v={id}` format.
- Submissions check for duplicate canonical URLs. If an ad already exists in `APPROVED` status, the submission form displays an alert linking directly to the approved campaign.

### 5. Brand & Product Autocomplete
- Brand autocomplete operates via a lightweight resource route [`/api/brands?q=`](file:///Users/muhammedaman/Desktop/brandit/app/routes/api.brands.ts) returning up to 8 case-insensitive matches as JSON.
- The submission form attaches a `<datalist>` populated via progressive enhancement fetch.
- If JavaScript is disabled, the form functions natively: typing an unlisted brand or product name prompts the server to search by slug first (preventing duplicates like `"Nike"`, `"NIKE"`, and `"Nike "`) and create the record if it does not yet exist.

### 6. Ad Submission & Lifecycle Workflow
1. **Creation**: Submissions require an active user session linked to an organization. `orgId` is extracted strictly from the authenticated user's session record (never from form data).
2. **Pending Queue**: New ads are saved with status `PENDING`. They do not appear on the home page, brand pages, or agency directories.
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
  Accessible to `ADMIN` and `EDITOR` roles. Lists submissions oldest-first with embed previews, metadata pills, and actions to Approve, Reject, Feature/Unfeature, or toggle `Organization.verified`.
- **All Campaigns Index** ([`/admin/ads`](file:///Users/muhammedaman/Desktop/brandit/app/routes/admin.ads.tsx)):
  Searchable index with status filters and inline status switchers.
- **Brand Consolidation** ([`/admin/brands`](file:///Users/muhammedaman/Desktop/brandit/app/routes/admin.brands.tsx)):
  Restricted to `ADMIN` only. In a single Prisma `$transaction`, transfers all ads and products from a duplicate source brand to a target brand, resolves duplicate product slugs, and deletes the duplicate brand.
- **Takedown Process** ([`/admin/reports`](file:///Users/muhammedaman/Desktop/brandit/app/routes/admin.reports.tsx)):
  Public visitors can submit takedown reports via `/ads/$id`. Moderators can review reasons and either dismiss the report or reject and takedown the campaign.

### 9. Security Architecture
- **State Changes**: Every mutation is an HTTP `POST` action. No state changes occur on `GET`.
- **Content Rendering**: All user text is rendered through React JSX (no `dangerouslySetInnerHTML`).
- **External Links**: Links specify `rel="noopener noreferrer"`. User URLs are validated via `isValidHttpUrl()` to ensure they only start with `http://` or `https://`.
- **Security Headers** in [`app/entry.server.tsx`](file:///Users/muhammedaman/Desktop/brandit/app/entry.server.tsx):
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy: frame-src https://www.youtube-nocookie.com;`

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
# Run Prisma migrations to set up the database schema
npm run db:migrate

# Seed agencies, brands, products, tags, initial ads, and the admin user
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

## Manual Verification Checklist

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
