import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { TestEnvironmentBanner } from "@/components/test/TestEnvironmentBanner";

export const metadata: Metadata = {
  title: "Orizon Aviation - Flight Director",
  description: "Plateforme de gestion pour Orizon Aviation"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body><TestEnvironmentBanner/><AuthProvider><AppShell>{children}</AppShell></AuthProvider></body></html>;
}
