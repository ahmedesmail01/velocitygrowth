import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Velocity Growth · Client portal",
  description: "Your brand’s customers, campaigns, and engagement results.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
