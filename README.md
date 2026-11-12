# Brandit — Ad Gallery Platform (Phase 1)

A minimal, high-aesthetic public library of advertising campaigns grouped by brand and posting creative agency. Built strictly with Remix (Vite-based), TypeScript, Prisma, PostgreSQL, and a single vanilla CSS stylesheet.

---

## Tech Stack & Architecture

- **Framework**: [Remix](https://remix.run) (Vite-based) with TypeScript
- **Database & ORM**: PostgreSQL + [Prisma](https://www.prisma.io/)
- **Styles**: Pure vanilla CSS in [app/styles.css](file:///Users/muhammedaman/Desktop/brandit/app/styles.css) (CSS Variables, dark mode support via `prefers-color-scheme`, responsive CSS grid, zero UI/CSS libraries)
- **Runtime Dependencies**: Strictly `@remix-run/*`, `react`, `react-dom`, `@prisma/client`, `prisma`, `tsx`, and `typescript`.

---

## Setup & Running the Project

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your PostgreSQL database credentials:

```bash
cp .env.example .env
```

Your `.env` file should contain:
```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/[DB]?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/[DB]"
SESSION_SECRET="your-secure-random-secret"
```

### 3. Run Database Migrations
Apply the initial Prisma schema migration to create all tables, enums, relations, and indexes:

```bash
npm run db:migrate
```

### 4. Seed the Database
Populate the database with 8 agencies, 10 brands (with products), 12 tags, and 30 verified YouTube campaign ads:

```bash
npm run db:seed
```

*(Note: The seed script is completely idempotent using Prisma upserts).*

### 5. Launch the Development Server
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Useful Database Commands

- **Run migrations**: `npm run db:migrate`
- **Re-run seed**: `npm run db:seed`
- **Open Prisma Studio**: `npm run db:studio`

---

## Phase 1 Milestone Verification Checklist

- [x] **Home (`/`)**: Displays a **Highlighted Campaigns** row (newest `featuredAt` first) and a **Latest Campaigns** grid with 24-per-page pagination.
- [x] **Ad Detail (`/ads/$id`)**: Displays the 16:9 responsive YouTube embed with click-to-load poster facade (no iframe until clicked), title, description, brand link, product, posting agency link, year, country, medium, track, and tags. Returns 404 for unapproved/missing ads.
- [x] **Brand Directory (`/brands`)**: Alphabetical listing of all brands with their industries and campaign counts.
- [x] **Brand Detail (`/brands/$slug`)**: Brand profile hero with agency filter buttons (`?agency=<slug>`) and year selector (`?year=<year>`), demonstrating the "same brand, different agencies" feature.
- [x] **Agency Detail (`/agencies/$slug`)**: Agency profile with location, website link, and a grid of all campaigns created by that agency.
