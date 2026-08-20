import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseGrid — Command Center",
  description: "Real-time healthcare supply chain intelligence dashboard. Monitor medicine inventory, bed occupancy, staff rosters, and cross-border demand signals across facilities.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        {/* Leaflet CSS (map library, not a custom font) */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
