import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Orizon Aviation - Flight Director",
  description: "Plateforme de gestion pour Orizon Aviation"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body><AppShell>{children}</AppShell></body></html>;
}
