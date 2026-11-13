import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { Medium, Track } from "@prisma/client";
import { prisma } from "~/db.server";
import { requireUser } from "~/session.server";
import { parseAdUrl } from "~/utils/parseAdUrl.server";
import { checkSubmitRateLimit } from "~/utils/rateLimit.server";
import { generateTagSlug, generateUniqueBrandSlug, generateUniqueProductSlug, slugify } from "~/utils/slugify.server";
import { isValidHttpUrl, normaliseUrl } from "~/utils/url.server";
import { AdEmbed } from "~/components/AdEmbed";

export const meta: MetaFunction = () => {
  return [
    { title: "Submit Campaign — Brandit" },
    { name: "description", content: "Submit an ad campaign for review and inclusion in the Brandit archive." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  if (!user.orgId) {
    return redirect("/onboarding");
  }
  return json({ user });
}

interface ActionData {
  fieldErrors?: {
    url?: string;
    title?: string;
    description?: string;
    brand?: string;
    product?: string;
    year?: string;
    country?: string;
    medium?: string;
    track?: string;
    tags?: string;
    imageUrl?: string;
  };
  formError?: string;
  existingApprovedAd?: {
    id: string;
    title: string;
  };
  fields?: {
    url?: string;
    title?: string;
    description?: string;
    brand?: string;
    product?: string;
    year?: string;
    country?: string;
    medium?: string;
    track?: string;
    tags?: string;
    imageUrl?: string;
  };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json<ActionData>({ formError: "Method not allowed" }, { status: 405 });
  }

  const user = await requireUser(request);
  if (!user.orgId) {
    return redirect("/onboarding");
  }

  // Rate limit: max 10 submissions per hour per user
  if (checkSubmitRateLimit(user.id)) {
    return json<ActionData>(
      {
        formError: "You have reached the submission limit of 10 ads per hour. Please try again later.",
      },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const rawUrl = (formData.get("url") as string)?.trim() || "";
  const title = (formData.get("title") as string)?.trim() || "";
  const description = (formData.get("description") as string)?.trim() || "";
  const brand = (formData.get("brand") as string)?.trim() || "";
  const product = (formData.get("product") as string)?.trim() || "";
  const yearStr = (formData.get("year") as string)?.trim() || "";
  const country = (formData.get("country") as string)?.trim() || "";
  const medium = (formData.get("medium") as string)?.trim() || "";
  const track = (formData.get("track") as string)?.trim() || "";
  const tagsStr = (formData.get("tags") as string)?.trim() || "";
  const imageUrl = (formData.get("imageUrl") as string)?.trim() || "";

  const fieldErrors: ActionData["fieldErrors"] = {};

  // 1. URL Validation
  if (!rawUrl) {
    fieldErrors.url = "Media URL is required.";
  } else if (!isValidHttpUrl(rawUrl)) {
    fieldErrors.url = "URL must start with http:// or https://";
  }

  // 2. Title validation (3-150 chars)
  if (!title) {
    fieldErrors.title = "Campaign title is required.";
  } else if (title.length < 3 || title.length > 150) {
    fieldErrors.title = "Title must be between 3 and 150 characters.";
  }

  // 3. Description validation (max 2000 chars)
  if (description && description.length > 2000) {
    fieldErrors.description = "Description cannot exceed 2000 characters.";
  }

  // 4. Brand validation
  if (!brand) {
    fieldErrors.brand = "Brand name is required.";
  } else if (brand.length > 100) {
    fieldErrors.brand = "Brand name cannot exceed 100 characters.";
  }

  // 5. Product validation
  if (product && product.length > 100) {
    fieldErrors.product = "Product name cannot exceed 100 characters.";
  }

  // 6. Year validation (1950 to current year + 1)
  const currentYear = new Date().getFullYear();
  const yearNum = parseInt(yearStr, 10);
  if (!yearStr || isNaN(yearNum)) {
    fieldErrors.year = "Please enter a valid year.";
  } else if (yearNum < 1950 || yearNum > currentYear + 1) {
    fieldErrors.year = `Year must be between 1950 and ${currentYear + 1}.`;
  }

  // 7. Country validation
  if (!country) {
    fieldErrors.country = "Country is required.";
  }

  // 8. Enum validations
  const validMediums = Object.values(Medium) as string[];
  if (!medium || !validMediums.includes(medium)) {
    fieldErrors.medium = "Please select a valid medium.";
  }

  const validTracks = Object.values(Track) as string[];
  if (!track || !validTracks.includes(track)) {
    fieldErrors.track = "Please select a valid track.";
  }

  // 9. Image URL validation (optional)
  if (imageUrl && !isValidHttpUrl(imageUrl)) {
    fieldErrors.imageUrl = "Image URL must start with http:// or https://";
  }

  // 10. Tags validation (max 8 tags, each max 30 chars)
  const rawTags = tagsStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (rawTags.length > 8) {
    fieldErrors.tags = "Maximum 8 tags allowed.";
  } else {
    for (const tag of rawTags) {
      if (tag.length > 30) {
        fieldErrors.tags = `Tag "${tag}" exceeds 30 characters.`;
        break;
      }
    }
  }

  let normalisedUrl = "";
  let parsedPlatform = { platform: "OTHER" as const, externalId: null as string | null };

  if (!fieldErrors.url) {
    try {
      normalisedUrl = normaliseUrl(rawUrl);
      const parsed = parseAdUrl(rawUrl);
      parsedPlatform = {
        platform: parsed.platform as any,
        externalId: parsed.externalId,
      };
    } catch {
      fieldErrors.url = "Could not parse or normalize the provided media URL.";
    }
  }

  // Check for duplicate ad URL
  if (normalisedUrl) {
    const existingAd = await prisma.ad.findFirst({
      where: {
        OR: [
          { url: normalisedUrl },
          { url: rawUrl },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (existingAd) {
      if (existingAd.status === "APPROVED") {
        return json<ActionData>(
          {
            fieldErrors: {
              url: `This campaign is already on Brandit: "${existingAd.title}".`,
            },
            existingApprovedAd: {
              id: existingAd.id,
              title: existingAd.title,
            },
            fields: {
              url: rawUrl,
              title,
              description,
              brand,
              product,
              year: yearStr,
              country,
              medium,
              track,
              tags: tagsStr,
              imageUrl,
            },
          },
          { status: 400 }
        );
      } else {
        fieldErrors.url = "This campaign URL has already been submitted for review.";
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json<ActionData>(
      {
        fieldErrors,
        fields: {
          url: rawUrl,
          title,
          description,
          brand,
          product,
          year: yearStr,
          country,
          medium,
          track,
          tags: tagsStr,
          imageUrl,
        },
      },
      { status: 400 }
    );
  }

  try {
    // 1. Find or create brand (find by slug or case-insensitive name)
    const brandBaseSlug = slugify(brand);
    let brandRecord = await prisma.brand.findUnique({
      where: { slug: brandBaseSlug },
    });

    if (!brandRecord) {
      brandRecord = await prisma.brand.findFirst({
        where: { name: { equals: brand, mode: "insensitive" } },
      });
    }

    if (!brandRecord) {
      const uniqueBrandSlug = await generateUniqueBrandSlug(brand);
      brandRecord = await prisma.brand.create({
        data: {
          name: brand,
          slug: uniqueBrandSlug,
        },
      });
    }

    // 2. Find or create product under the brand (if given)
    let productRecord = null;
    if (product) {
      const productBaseSlug = slugify(product);
      productRecord = await prisma.product.findUnique({
        where: {
          brandId_slug: {
            brandId: brandRecord.id,
            slug: productBaseSlug,
          },
        },
      });

      if (!productRecord) {
        productRecord = await prisma.product.findFirst({
          where: {
            brandId: brandRecord.id,
            name: { equals: product, mode: "insensitive" },
          },
        });
      }

      if (!productRecord) {
        const uniqueProductSlug = await generateUniqueProductSlug(brandRecord.id, product);
        productRecord = await prisma.product.create({
          data: {
            name: product,
            slug: uniqueProductSlug,
            brandId: brandRecord.id,
          },
        });
      }
    }

    // 3. Upsert tags
    const tagConnects: { id: string }[] = [];
    for (const rawTag of rawTags.slice(0, 8)) {
      const slug = generateTagSlug(rawTag);
      if (!slug) continue;

      const tagRecord = await prisma.tag.upsert({
        where: { slug },
        update: {},
        create: {
          name: rawTag.slice(0, 30),
          slug,
        },
      });
      tagConnects.push({ id: tagRecord.id });
    }

    // 4. Create the ad with orgId strictly from user.orgId
    await prisma.ad.create({
      data: {
        title,
        description: description || null,
        url: normalisedUrl,
        platform: parsedPlatform.platform as any,
        externalId: parsedPlatform.externalId,
        imageUrl: imageUrl || null,
        medium: medium as Medium,
        track: track as Track,
        year: yearNum,
        country,
        status: "PENDING",
        brandId: brandRecord.id,
        productId: productRecord ? productRecord.id : null,
        orgId: user.orgId,
        tags: {
          connect: tagConnects.map((t) => ({ id: t.id })),
        },
      },
    });

    return redirect("/dashboard?submitted=true");
  } catch (error) {
    console.error("Ad submission failed:", error);
    return json<ActionData>(
      {
        formError: "Failed to submit ad. Please verify your fields and try again.",
        fields: {
          url: rawUrl,
          title,
          description,
          brand,
          product,
          year: yearStr,
          country,
          medium,
          track,
          tags: tagsStr,
          imageUrl,
        },
      },
      { status: 500 }
    );
  }
}

export default function SubmitRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [urlInput, setUrlInput] = useState(actionData?.fields?.url || "");
  const [brandInput, setBrandInput] = useState(actionData?.fields?.brand || "");
  const [brandSuggestions, setBrandSuggestions] = useState<Array<{ id: string; name: string }>>([]);
  const [previewData, setPreviewData] = useState<{
    valid: boolean;
    platform: string;
    externalId: string | null;
  } | null>(null);

  // Progressive enhancement: brand autocomplete
  useEffect(() => {
    if (!brandInput || brandInput.length < 2) {
      setBrandSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/brands?q=${encodeURIComponent(brandInput)}`)
        .then((res) => (res.ok ? res.json() : { brands: [] }))
        .then((data) => {
          if (Array.isArray(data.brands)) {
            setBrandSuggestions(data.brands);
          }
        })
        .catch(() => setBrandSuggestions([]));
    }, 200);

    return () => clearTimeout(timer);
  }, [brandInput]);

  // Live URL preview
  useEffect(() => {
    if (!urlInput || !urlInput.startsWith("http")) {
      setPreviewData(null);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/parse-url?url=${encodeURIComponent(urlInput)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.valid) {
            setPreviewData({
              valid: true,
              platform: data.platform,
              externalId: data.externalId,
            });
          } else {
            setPreviewData(null);
          }
        })
        .catch(() => setPreviewData(null));
    }, 300);

    return () => clearTimeout(timer);
  }, [urlInput]);

  return (
    <div className="form-container">
      <div className="form-card">
        <div className="form-card-header">
          <h1>Submit an Ad Campaign</h1>
          <p>
            Share award-winning campaigns, student work, or iconic advertisements with the Brandit community.
          </p>
        </div>

        {actionData?.formError && (
          <div className="alert-banner alert-error" role="alert">
            {actionData.formError}
          </div>
        )}

        {actionData?.existingApprovedAd && (
          <div className="alert-banner alert-info" role="status">
            <span>This campaign is already approved in Brandit: </span>
            <Link
              to={`/ads/${actionData.existingApprovedAd.id}`}
              style={{ fontWeight: 600, textDecoration: "underline" }}
            >
              View &quot;{actionData.existingApprovedAd.title}&quot; ↗
            </Link>
          </div>
        )}

        <Form method="post" className="form-vertical" noValidate>
          {/* Media URL with live embed preview */}
          <div className="form-group">
            <label htmlFor="url">
              Media / Campaign URL <span className="req-star">*</span>
            </label>
            <input
              id="url"
              name="url"
              type="url"
              required
              placeholder="e.g. https://www.youtube.com/watch?v=..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className={actionData?.fieldErrors?.url ? "input-error" : ""}
            />
            <span className="form-hint">
              Supports YouTube (watch, shorts, youtu.be), or web campaigns.
            </span>
            {actionData?.fieldErrors?.url && (
              <span className="form-error-msg">{actionData.fieldErrors.url}</span>
            )}
          </div>

          {/* Live Preview Embed */}
          {previewData?.valid && (
            <div className="submit-preview-box">
              <span className="preview-label">Live Preview ({previewData.platform})</span>
              <AdEmbed
                platform={previewData.platform}
                externalId={previewData.externalId}
                url={urlInput}
                title="Live Preview"
              />
            </div>
          )}

          {/* Title */}
          <div className="form-group">
            <label htmlFor="title">
              Campaign Title <span className="req-star">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. Dream Crazy, 1984, The Epic Split"
              defaultValue={actionData?.fields?.title || ""}
              className={actionData?.fieldErrors?.title ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.title && (
              <span className="form-error-msg">{actionData.fieldErrors.title}</span>
            )}
          </div>

          {/* Brand & Product */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="brand">
                Brand Name <span className="req-star">*</span>
              </label>
              <input
                id="brand"
                name="brand"
                type="text"
                required
                list="brand-datalist"
                placeholder="e.g. Nike, Apple, Volvo"
                value={brandInput}
                onChange={(e) => setBrandInput(e.target.value)}
                className={actionData?.fieldErrors?.brand ? "input-error" : ""}
                autoComplete="off"
              />
              <datalist id="brand-datalist">
                {brandSuggestions.map((b) => (
                  <option key={b.id} value={b.name} />
                ))}
              </datalist>
              <span className="form-hint">
                Type to search or enter a new brand name.
              </span>
              {actionData?.fieldErrors?.brand && (
                <span className="form-error-msg">{actionData.fieldErrors.brand}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="product">Product / Sub-brand (optional)</label>
              <input
                id="product"
                name="product"
                type="text"
                placeholder="e.g. Air Jordan, iPhone, Search"
                defaultValue={actionData?.fields?.product || ""}
                className={actionData?.fieldErrors?.product ? "input-error" : ""}
              />
              {actionData?.fieldErrors?.product && (
                <span className="form-error-msg">{actionData.fieldErrors.product}</span>
              )}
            </div>
          </div>

          {/* Year & Country */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="year">
                Year <span className="req-star">*</span>
              </label>
              <input
                id="year"
                name="year"
                type="number"
                min="1950"
                max={new Date().getFullYear() + 1}
                required
                placeholder="e.g. 2024"
                defaultValue={actionData?.fields?.year || new Date().getFullYear().toString()}
                className={actionData?.fieldErrors?.year ? "input-error" : ""}
              />
              {actionData?.fieldErrors?.year && (
                <span className="form-error-msg">{actionData.fieldErrors.year}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="country">
                Country <span className="req-star">*</span>
              </label>
              <input
                id="country"
                name="country"
                type="text"
                required
                placeholder="e.g. United States, United Kingdom"
                defaultValue={actionData?.fields?.country || ""}
                className={actionData?.fieldErrors?.country ? "input-error" : ""}
              />
              {actionData?.fieldErrors?.country && (
                <span className="form-error-msg">{actionData.fieldErrors.country}</span>
              )}
            </div>
          </div>

          {/* Medium & Track */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="medium">
                Medium <span className="req-star">*</span>
              </label>
              <select
                id="medium"
                name="medium"
                required
                defaultValue={actionData?.fields?.medium || "VIDEO"}
                className={actionData?.fieldErrors?.medium ? "input-error" : ""}
              >
                <option value="VIDEO">Video / TVC</option>
                <option value="PRINT">Print</option>
                <option value="OUTDOOR">Outdoor / OOH</option>
                <option value="DIGITAL">Digital / Interactive</option>
                <option value="SOCIAL">Social Media</option>
                <option value="AUDIO">Audio / Radio</option>
              </select>
              {actionData?.fieldErrors?.medium && (
                <span className="form-error-msg">{actionData.fieldErrors.medium}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="track">
                Track <span className="req-star">*</span>
              </label>
              <select
                id="track"
                name="track"
                required
                defaultValue={actionData?.fields?.track || "PROFESSIONAL"}
                className={actionData?.fieldErrors?.track ? "input-error" : ""}
              >
                <option value="PROFESSIONAL">Professional Work</option>
                <option value="STUDENT">Student / Spec Work</option>
              </select>
              {actionData?.fieldErrors?.track && (
                <span className="form-error-msg">{actionData.fieldErrors.track}</span>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="form-group">
            <label htmlFor="tags">Tags (comma-separated, max 8)</label>
            <input
              id="tags"
              name="tags"
              type="text"
              placeholder="e.g. Super Bowl, Humor, Emotional, Animation"
              defaultValue={actionData?.fields?.tags || ""}
              className={actionData?.fieldErrors?.tags ? "input-error" : ""}
            />
            <span className="form-hint">Separate multiple tags with commas.</span>
            {actionData?.fieldErrors?.tags && (
              <span className="form-error-msg">{actionData.fieldErrors.tags}</span>
            )}
          </div>

          {/* Poster Image URL */}
          <div className="form-group">
            <label htmlFor="imageUrl">Poster / Image URL (optional)</label>
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              placeholder="https://example.com/poster.jpg"
              defaultValue={actionData?.fields?.imageUrl || ""}
              className={actionData?.fieldErrors?.imageUrl ? "input-error" : ""}
            />
            <span className="form-hint">
              Used as thumbnail or for print campaigns.
            </span>
            {actionData?.fieldErrors?.imageUrl && (
              <span className="form-error-msg">{actionData.fieldErrors.imageUrl}</span>
            )}
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="description">Campaign Description</label>
            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={2000}
              placeholder="Provide background, creative strategy, awards, or context..."
              defaultValue={actionData?.fields?.description || ""}
              className={actionData?.fieldErrors?.description ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.description && (
              <span className="form-error-msg">{actionData.fieldErrors.description}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting Campaign..." : "Submit Campaign for Review"}
          </button>
        </Form>
      </div>
    </div>
  );
}

