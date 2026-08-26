import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clover Tree Command Center",
  description: "Source-bound owner command center and Launch Studio preview.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%2308110d'/%3E%3Ccircle cx='24' cy='24' r='13' fill='%23c9f36b'/%3E%3Ccircle cx='40' cy='24' r='13' fill='%2370e6b1'/%3E%3Ccircle cx='24' cy='40' r='13' fill='%2370e6b1'/%3E%3Ccircle cx='40' cy='40' r='13' fill='%23c9f36b'/%3E%3C/svg%3E"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to Tree Command Center</a>
        {children}
      </body>
    </html>
  );
}
