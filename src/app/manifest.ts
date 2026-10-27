import type { MetadataRoute } from "next";

/** Web app manifest: makes purojekuto installable — "Add to Home Screen" on iPhone gives a full-screen app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "purojekuto",
    short_name: "purojekuto",
    description: "Your personal projects: specs, boards, purchases and work sessions — on your own machine.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0f1419",
    theme_color: "#0f1419",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      { name: "New project", short_name: "New", url: "/projects/new" },
      { name: "Planning", url: "/planning" },
    ],
  };
}
