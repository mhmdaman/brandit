import { Form, Link, NavLink, useRouteLoaderData } from "@remix-run/react";
import type { ReactNode } from "react";
import type { loader as rootLoader } from "~/root";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const user = rootData?.user;

  return (
    <div className="app-wrapper">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-brand" aria-label="Brandit Home">
            {/* Triangle logo matching screenshot */}
            <svg className="brand-logo-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path d="M14 3L26 24H2L14 3Z" fill="white"/>
            </svg>
            <span>Brandit</span>
          </Link>

          <nav className="site-nav" aria-label="Main Navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Home
            </NavLink>
            <NavLink
              to="/brands"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Brands
            </NavLink>

            {user ? (
              <>
                <NavLink
                  to="/submit"
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  Submit
                </NavLink>
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  Dashboard
                </NavLink>

                {(user.role === "ADMIN" || user.role === "EDITOR") && (
                  <NavLink
                    to="/admin/review"
                    className={({ isActive }) =>
                      isActive ? "active nav-admin-link" : "nav-admin-link"
                    }
                  >
                    Admin
                  </NavLink>
                )}

                <Form method="post" action="/logout" className="logout-form">
                  <button type="submit" className="nav-logout-btn">
                    Logout
                  </button>
                </Form>
              </>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  Login
                </NavLink>
                <NavLink
                  to="/register"
                  className={({ isActive }) =>
                    isActive ? "active nav-btn-register" : "nav-btn-register"
                  }
                >
                  Register
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="main-content">{children}</main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p>© {new Date().getFullYear()} Brandit. A curated ad campaign gallery.</p>
          <p>The Art of Advertising.</p>
        </div>
      </footer>
    </div>
  );
}
