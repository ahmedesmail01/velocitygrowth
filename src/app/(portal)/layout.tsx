import { AuthGate } from "@/components/auth";
import { Shell } from "@/components/shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Shell>{children}</Shell>
    </AuthGate>
  );
}
