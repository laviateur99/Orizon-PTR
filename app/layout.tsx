import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Orizon Aviation - Flight Director",
  description: "Plateforme de gestion Orizon Aviation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
