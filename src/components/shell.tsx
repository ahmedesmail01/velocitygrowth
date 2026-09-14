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
  async function logout() {
    const { error } = await db().auth.signOut({ scope: "local" });
    if (error) setError("Could not sign out. Please try again.");
    else router.replace("/login");
  }
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="wordmark" href="/dashboard">
          <span className="mark">
            V<ArrowUpRight size={15} />
          </span>
          velocity<span className="wordmark-small">GROWTH</span>
        </Link>
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
            >
              <Icon size={19} />
              <span>{title}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="role-tag">{membership.role}</span>
          <p title={session.user.email}>{session.user.email}</p>
          <button className="logout" onClick={logout}>
            <LogOut size={17} /> Sign out
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            Workspace <span className="crumb">/</span>{" "}
            <strong>
              {links.find((x) => x[0] === path)?.[1] ?? "Overview"}
            </strong>
          </span>
          <span className="brand-tag">{brand.code}</span>
        </header>
        <main className="content">{children}</main>
        <footer>
          Velocity Growth <span>{brand.timezone}</span>
        </footer>
      </div>
    </div>
  );
}
