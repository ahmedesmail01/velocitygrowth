"use client";
import { db } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState } from "react";
export default function NoAccess() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <main className="gate">
      <div className="panel">
        <div className="eyebrow">ACCESS RESTRICTED</div>
        <h1>No workspace assigned</h1>
        <p>
          This account doesn’t have an active brand membership. Sign in with an
          approved account or contact your workspace administrator.
        </p>
        <button
          onClick={async () => {
            const { error } = await db().auth.signOut({ scope: "local" });
            if (error) setError("Could not sign out. Try again.");
            else router.replace("/login");
          }}
        >
          Use another account
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    </main>
  );
}
