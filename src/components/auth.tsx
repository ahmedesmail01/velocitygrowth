"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { db } from "@/lib/supabase";
import type { Brand, Membership } from "@/lib/types";
import { AlertCircle } from "lucide-react";

type Access = { session: Session; membership: Membership; brand: Brand };
const Context = createContext<Access | null>(null);

export function useAccess() {
  const a = useContext(Context);
  if (!a) throw Error("Missing access context");
  return a;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    try {
      const client = db();
      const { data } = client.auth.onAuthStateChange((_event, s) => {
        if (live) setSession(s);
      });
      client.auth
        .getSession()
        .then(({ data, error }) => {
          if (live) {
            if (error)
              setError(
                "Your session could not be restored. Please sign in again.",
              );
            setSession(data.session);
          }
        })
        .catch(() => {
          if (live) setError("Unable to restore your session.");
        });
      return () => {
        live = false;
        data.subscription.unsubscribe();
      };
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      setAccess(null);
      router.replace("/login");
      return;
    }
    let live = true;
    setAccess(null);
    setError("");
    (async () => {
      const { data: user, error: authError } = await db().auth.getUser();
      if (authError || !user.user) {
        if (live) router.replace("/login");
        return;
      }
      const { data: m, error: mError } = await db()
        .from("brand_memberships")
        .select("user_id,brand_id,role,active")
        .eq("user_id", user.user.id)
        .eq("active", true)
        .maybeSingle();
      if (mError)
        throw Error("We could not check your access. Please try again.");
      if (!m) {
        if (live) router.replace("/no-access");
        return;
      }
      const { data: b, error: bError } = await db()
        .from("brands")
        .select("id,code,name,timezone")
        .eq("id", m.brand_id)
        .single();
      if (bError || !b)
        throw Error("We could not load your brand. Please try again.");
      if (live) setAccess({ session, membership: m as Membership, brand: b });
    })().catch((e) => {
      if (live) setError((e as Error).message);
    });
    return () => {
      live = false;
    };
  }, [session, router, retry]);

  if (error)
    return (
      <main className="gate">
        <div className="panel" style={{ maxWidth: "460px", textAlign: "center", padding: "36px 28px" }}>
          <div
            className="icon-tile"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              margin: "0 auto 16px",
              background: "#fef2f2",
              borderColor: "#fecaca",
              color: "#dc2626",
            }}
          >
            <AlertCircle size={24} />
          </div>
          <h1 style={{ fontSize: "22px" }}>Unable to open your workspace</h1>
          <p role="alert" style={{ margin: "12px 0 20px", color: "#991b1b", fontSize: "13.5px" }}>
            {error}
          </p>
          <button className="button" style={{ width: "100%" }} onClick={() => setRetry((x) => x + 1)}>
            Try again
          </button>
          <a href="/login" style={{ marginTop: "14px", display: "inline-block" }}>
            Back to sign in
          </a>
        </div>
      </main>
    );

  if (!access || access.session.user.id !== session?.user.id)
    return (
      <main className="gate" aria-busy="true">
        <div className="mark" style={{ width: "44px", height: "44px", fontSize: "24px", marginBottom: "12px" }}>
          V
        </div>
        <div className="spinner" />
        <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--muted)", marginTop: "8px" }}>
          Opening your workspace…
        </p>
      </main>
    );

  return (
    <Context.Provider value={access}>
      <div key={access.membership.user_id}>{children}</div>
    </Context.Provider>
  );
}
