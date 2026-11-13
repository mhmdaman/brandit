import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { Medium, Track } from "@prisma/client";
import { prisma } from "~/db.server";
import { requireUser } from "~/session.server";
import { parseAdUrl } from "~/utils/parseAdUrl.server";
import { generateTagSlug, generateUniqueBrandSlug, generateUniqueProductSlug, slugify } from "~/utils/slugify.server";
import { isValidHttpUrl, normaliseUrl } from "~/utils/url.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Edit Campaign — Brandit" },
    { name: "description", content: "Edit your submitted campaign details." },
  ];
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  if (!user.orgId) {
    return redirect("/onboarding");
  }

  const { id } = params;
  if (!id) {
    throw new Response("Ad ID required", { status: 400 });
  }

  const ad = await prisma.ad.findUnique({
    where: { id },
    include: {
      brand: true,
      product: true,
      tags: true,
    },
  });

  if (!ad) {
    throw new Response("Ad not found", { status: 404 });
  }

  // Strict ownership check in loader
  if (ad.orgId !== user.orgId) {
    throw new Response("Forbidden: You do not have permission to edit this campaign.", {
      status: 403,
    });
  }

  return json({ ad });
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
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json<ActionData>({ formError: "Method not allowed" }, { status: 405 });
  }

  const user = await requireUser(request);
  if (!user.orgId) {
    return redirect("/onboarding");
  }

  const { id } = params;
  if (!id) {
    throw new Response("Ad ID required", { status: 400 });
  }

  const existingAd = await prisma.ad.findUnique({
    where: { id },
    select: { id: true, orgId: true, status: true },
  });

  if (!existingAd) {
    throw new Response("Ad not found", { status: 404 });
  }

  // Strict ownership check in action
  if (existingAd.orgId !== user.orgId) {
    throw new Response("Forbidden: You do not have permission to edit this campaign.", {
      status: 403,
    });
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

  if (!rawUrl || !isValidHttpUrl(rawUrl)) {
    fieldErrors.url = "Valid media URL is required (http or https).";
  }

  if (!title || title.length < 3 || title.length > 150) {
    fieldErrors.title = "Title must be between 3 and 150 characters.";
  }

  if (description && description.length > 2000) {
    fieldErrors.description = "Description cannot exceed 2000 characters.";
  }

  if (!brand || brand.length > 100) {
    fieldErrors.brand = "Brand name is required (max 100 characters).";
  }

  const currentYear = new Date().getFullYear();
  const yearNum = parseInt(yearStr, 10);
  if (!yearStr || isNaN(yearNum) || yearNum < 1950 || yearNum > currentYear + 1) {
    fieldErrors.year = `Year must be between 1950 and ${currentYear + 1}.`;
  }

  if (!country) {
    fieldErrors.country = "Country is required.";
  }

  const validMediums = Object.values(Medium) as string[];
  if (!medium || !validMediums.includes(medium)) {
    fieldErrors.medium = "Please select a valid medium.";
  }

  const validTracks = Object.values(Track) as string[];
  if (!track || !validTracks.includes(track)) {
    fieldErrors.track = "Please select a valid track.";
  }

  if (imageUrl && !isValidHttpUrl(imageUrl)) {
    fieldErrors.imageUrl = "Image URL must start with http:// or https://";
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

  // Check for duplicate URL excluding this ad itself
  if (normalisedUrl) {
    const duplicate = await prisma.ad.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [{ url: normalisedUrl }, { url: rawUrl }],
          },
        ],
      },
    });

    if (duplicate) {
      fieldErrors.url = "Another ad already exists with this URL.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json<ActionData>({ fieldErrors }, { status: 400 });
  }

  try {
    // Brand find or create
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
        data: { name: brand, slug: uniqueBrandSlug },
      });
    }

    // Product find or create
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

    // Tags
    const rawTags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);

    const tagConnects: { id: string }[] = [];
    for (const rawTag of rawTags) {
      const slug = generateTagSlug(rawTag);
      if (!slug) continue;
      const tagRecord = await prisma.tag.upsert({
        where: { slug },
        update: {},
        create: { name: rawTag.slice(0, 30), slug },
      });
      tagConnects.push({ id: tagRecord.id });
    }

    // "Editing an APPROVED ad sets it back to PENDING so changes get re-reviewed."
    await prisma.ad.update({
      where: { id },
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
        status: "PENDING", // reset to pending review
        rejectionReason: null, // clear previous rejection reason
        brandId: brandRecord.id,
        productId: productRecord ? productRecord.id : null,
        tags: {
          set: tagConnects.map((t) => ({ id: t.id })),
        },
      },
    });

    return redirect("/dashboard");
  } catch (error) {
    console.error("Ad update failed:", error);
    return json<ActionData>(
      { formError: "Failed to update campaign. Please check inputs and try again." },
      { status: 500 }
    );
  }
}

export default function EditAdRoute() {
  const { ad } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const defaultTags = ad.tags.map((t) => t.name).join(", ");

  return (
    <div className="form-container">
      <div className="form-card">
        <div className="form-card-header">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to="/dashboard">Dashboard</Link>
            <span className="breadcrumbs-sep">/</span>
            <span>Edit Campaign</span>
          </nav>
          <h1>Edit Campaign: {ad.title}</h1>
          {ad.status === "APPROVED" && (
            <div className="alert-banner alert-warning" role="alert">
              ⚠️ Note: This ad is currently approved. Saving modifications will set its status
              back to <strong>PENDING</strong> for administrator re-review.
            </div>
          )}
          {ad.status === "REJECTED" && ad.rejectionReason && (
            <div className="alert-banner alert-error" role="alert">
              Previous Rejection Reason: {ad.rejectionReason}
            </div>
          )}
        </div>

        {actionData?.formError && (
          <div className="alert-banner alert-error" role="alert">
            {actionData.formError}
          </div>
        )}

        <Form method="post" className="form-vertical" noValidate>
          <div className="form-group">
            <label htmlFor="url">
              Campaign URL <span className="req-star">*</span>
            </label>
            <input
              id="url"
              name="url"
              type="url"
              required
              defaultValue={ad.url}
              className={actionData?.fieldErrors?.url ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.url && (
              <span className="form-error-msg">{actionData.fieldErrors.url}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="title">
              Campaign Title <span className="req-star">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={ad.title}
              className={actionData?.fieldErrors?.title ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.title && (
              <span className="form-error-msg">{actionData.fieldErrors.title}</span>
            )}
          </div>

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
                defaultValue={ad.brand.name}
                className={actionData?.fieldErrors?.brand ? "input-error" : ""}
              />
              {actionData?.fieldErrors?.brand && (
                <span className="form-error-msg">{actionData.fieldErrors.brand}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="product">Product / Sub-brand</label>
              <input
                id="product"
                name="product"
                type="text"
                defaultValue={ad.product?.name || ""}
                className={actionData?.fieldErrors?.product ? "input-error" : ""}
              />
            </div>
          </div>

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
                defaultValue={ad.year}
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
                defaultValue={ad.country}
                className={actionData?.fieldErrors?.country ? "input-error" : ""}
              />
              {actionData?.fieldErrors?.country && (
                <span className="form-error-msg">{actionData.fieldErrors.country}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="medium">
                Medium <span className="req-star">*</span>
              </label>
              <select
                id="medium"
                name="medium"
                required
                defaultValue={ad.medium}
                className={actionData?.fieldErrors?.medium ? "input-error" : ""}
              >
                <option value="VIDEO">Video / TVC</option>
                <option value="PRINT">Print</option>
                <option value="OUTDOOR">Outdoor / OOH</option>
                <option value="DIGITAL">Digital / Interactive</option>
                <option value="SOCIAL">Social Media</option>
                <option value="AUDIO">Audio / Radio</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="track">
                Track <span className="req-star">*</span>
              </label>
              <select
                id="track"
                name="track"
                required
                defaultValue={ad.track}
                className={actionData?.fieldErrors?.track ? "input-error" : ""}
              >
                <option value="PROFESSIONAL">Professional Work</option>
                <option value="STUDENT">Student / Spec Work</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="tags">Tags (comma-separated)</label>
            <input
              id="tags"
              name="tags"
              type="text"
              defaultValue={defaultTags}
              className={actionData?.fieldErrors?.tags ? "input-error" : ""}
            />
          </div>

          <div className="form-group">
            <label htmlFor="imageUrl">Poster Image URL (optional)</label>
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              defaultValue={ad.imageUrl || ""}
              className={actionData?.fieldErrors?.imageUrl ? "input-error" : ""}
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={2000}
              defaultValue={ad.description || ""}
              className={actionData?.fieldErrors?.description ? "input-error" : ""}
            />
          </div>

          <div className="form-actions-row">
            <Link to="/dashboard" className="btn btn-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving Changes..." : "Save and Resubmit"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

