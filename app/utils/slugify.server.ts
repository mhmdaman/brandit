import { prisma } from "~/db.server";

/**
 * Converts a string to a clean, URL-safe slug:
 * - Lowercase
 * - Strips diacritics / accents
 * - Converts non-alphanumeric characters to hyphens
 * - Trims leading and trailing hyphens
 */
export function slugify(text: string): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumerics with hyphen
    .replace(/^-+|-+$/g, ""); // trim leading and trailing hyphens
}

/**
 * Generates a unique organization slug. If collision occurs, appends -2, -3, etc.
 */
export async function generateUniqueOrgSlug(name: string): Promise<string> {
  const baseSlug = slugify(name) || "org";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) {
      return slug;
    }
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Generates a unique brand slug. If collision occurs, appends -2, -3, etc.
 */
export async function generateUniqueBrandSlug(name: string): Promise<string> {
  const baseSlug = slugify(name) || "brand";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.brand.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) {
      return slug;
    }
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Generates a unique product slug for a brand.
 */
export async function generateUniqueProductSlug(brandId: string, name: string): Promise<string> {
  const baseSlug = slugify(name) || "product";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.product.findUnique({
      where: {
        brandId_slug: {
          brandId,
          slug,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      return slug;
    }
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Generates a tag slug.
 */
export function generateTagSlug(name: string): string {
  return slugify(name).slice(0, 30);
}

