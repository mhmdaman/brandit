-- AlterEnum
ALTER TYPE "Platform" ADD VALUE 'VIMEO';

-- AlterTable
ALTER TABLE "Ad" ADD COLUMN     "course" TEXT,
ADD COLUMN     "school" TEXT;

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bookmark_userId_idx" ON "Bookmark"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_adId_key" ON "Bookmark"("userId", "adId");

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search Indexes & pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN full-text index on title and description
CREATE INDEX "Ad_title_description_fts_idx" ON "Ad" USING gin (to_tsvector('simple', "title" || ' ' || coalesce("description", '')));

-- GIN trigram indexes on title, brand name, and organization name
CREATE INDEX "Ad_title_trgm_idx" ON "Ad" USING gin ("title" gin_trgm_ops);
CREATE INDEX "Brand_name_trgm_idx" ON "Brand" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Organization_name_trgm_idx" ON "Organization" USING gin ("name" gin_trgm_ops);

