import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clover Launch Studio",
  description: "Private owner workspace for evidence-bound Launch Sessions."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to Launch Studio</a>
        {children}
      </body>
    </html>
  );
}
