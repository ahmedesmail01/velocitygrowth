"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Send,
  FileCheck2,
  LogOut,
  ArrowUpRight,
  Menu,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAccess } from "./auth";
import { db } from "@/lib/supabase";

const links = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/contacts", "Contacts", Users],
  ["/campaigns", "Campaigns", Send],
  ["/imports", "Import reports", FileCheck2],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { brand, membership, session } = useAccess();
  const path = usePathname(),
    router = useRouter();
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    const { error } = await db().auth.signOut({ scope: "local" });
    if (error) setError("Could not sign out. Please try again.");
    else router.replace("/login");
  }

  return (
    <div className="workspace">
      <div
        className={`sidebar-backdrop ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link className="wordmark" href="/dashboard" onClick={() => setMobileOpen(false)}>
            <span className="mark">
              V<ArrowUpRight size={15} />
            </span>
            velocity<span className="wordmark-small">GROWTH</span>
          </Link>
          {mobileOpen && (
            <button
              className="mobile-nav-toggle"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              style={{ color: "#ffffff", borderColor: "rgba(255,255,255,0.2)" }}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="brand-card">
          <span className="avatar">{brand.code.slice(0, 2)}</span>
          <div>
            <strong>{brand.name}</strong>
            <small>Client workspace</small>
          </div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map(([url, title, Icon]) => (
            <Link
              key={url}
              href={url}
              className={path === url ? "active" : ""}
              aria-current={path === url ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} />
              <span>{title}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="role-tag">{membership.role}</span>
          <p title={session.user.email}>{session.user.email}</p>
          <button className="logout" onClick={logout}>
            <LogOut size={16} /> Sign out
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="mobile-nav-toggle"
              aria-label="Open navigation menu"
              onClick={() => setMobileOpen((o) => !o)}
            >
              <Menu size={18} />
            </button>
            <span>
              Workspace <span className="crumb">/</span>{" "}
              <strong>
                {links.find((x) => x[0] === path)?.[1] ?? "Overview"}
              </strong>
            </span>
          </div>
          <span className="brand-tag">{brand.code}</span>
        </header>
        <main className="content">{children}</main>
        <footer>
          <span>Velocity Growth Portal</span>
          <span>Timezone: {brand.timezone}</span>
        </footer>
      </div>
    </div>
  );
}
