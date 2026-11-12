import { createCookieSessionStorage, redirect } from "@remix-run/node";
import type { User, Organization } from "@prisma/client";
import { prisma } from "./db.server";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__brandit_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [SESSION_SECRET],
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
});

export type AuthUser = User & {
  org: Organization | null;
};

/**
 * Validates that a redirect path is safe and strictly relative (starts with '/' and not '//').
 */
export function safeRedirect(to: unknown, defaultRedirect: string = "/"): string {
  if (!to || typeof to !== "string") {
    return defaultRedirect;
  }

  const trimmed = to.trim();
  // Ensure it starts with a single '/' and does not start with '//' or contain control characters
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
    return trimmed;
  }

  return defaultRedirect;
}

export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

export async function getUserId(request: Request): Promise<string | null> {
  const session = await getSession(request);
  const userId = session.get("userId");
  return typeof userId === "string" ? userId : null;
}

/**
 * Returns the currently authenticated user with their associated organization, or null if not logged in.
 */
export async function getUser(request: Request): Promise<AuthUser | null> {
  const userId = await getUserId(request);
  if (!userId) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { org: true },
    });

    if (!user) {
      return null;
    }

    return user;
  } catch (error) {
    console.error("Error fetching authenticated user:", error);
    return null;
  }
}

/**
 * Requires an authenticated user. Throws a redirect to /login?redirectTo=... if not logged in.
 */
export async function requireUser(request: Request): Promise<AuthUser> {
  const user = await getUser(request);
  if (!user) {
    const url = new URL(request.url);
    const redirectTo = `${url.pathname}${url.search}`;
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/login?${searchParams}`);
  }

  return user;
}

/**
 * Requires an admin user.
 * By default, both ADMIN and EDITOR are permitted (e.g. for reviewing ads).
 * If adminOnly is true, only role ADMIN is permitted (e.g. for merging brands, role changes).
 */
export async function requireAdmin(
  request: Request,
  options?: { adminOnly?: boolean }
): Promise<AuthUser> {
  const user = await requireUser(request);

  if (options?.adminOnly) {
    if (user.role !== "ADMIN") {
      throw new Response("Forbidden: Administrator privileges required.", { status: 403 });
    }
  } else {
    if (user.role !== "ADMIN" && user.role !== "EDITOR") {
      throw new Response("Forbidden: Admin or Editor privileges required.", { status: 403 });
    }
  }

  return user;
}

/**
 * Creates a new user session cookie and redirects to redirectTo.
 */
export async function createUserSession(userId: string, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);

  return redirect(safeRedirect(redirectTo, "/"), {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

/**
 * Destroys the current user session cookie and redirects to /.
 */
export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}
