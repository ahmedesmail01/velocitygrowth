"use client";
import { db } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldAlert, LogOut } from "lucide-react";

export default function NoAccess() {
  const router = useRouter();
  const [error, setError] = useState("");

  return (
    <main className="gate">
      <div className="panel" style={{ maxWidth: "460px", textAlign: "center", padding: "40px 32px" }}>
        <div
          className="icon-tile"
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "14px",
            margin: "0 auto 18px",
            background: "#fff1f2",
            borderColor: "#fecdd3",
            color: "#e11d48",
          }}
        >
          <ShieldAlert size={26} />
        </div>

        <div className="eyebrow" style={{ color: "#e11d48", justifyContent: "center" }}>
          ACCESS RESTRICTED
        </div>
        <h1 style={{ fontSize: "24px" }}>No workspace assigned</h1>
        <p style={{ marginTop: "10px", fontSize: "14px", color: "var(--muted)" }}>
          This account doesn’t have an active brand membership. Sign in with an
          approved brand account or contact your portal administrator.
        </p>

        <button
          className="button"
          style={{ marginTop: "24px", width: "100%" }}
          onClick={async () => {
            const { error } = await db().auth.signOut({ scope: "local" });
            if (error) setError("Could not sign out. Try again.");
            else router.replace("/login");
          }}
        >
          <LogOut size={16} />
          Use another account
        </button>

        {error && (
          <p role="alert" style={{ color: "#dc2626", marginTop: "14px", fontSize: "13px" }}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
