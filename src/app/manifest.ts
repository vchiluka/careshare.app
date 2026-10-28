import type { MetadataRoute } from "next";

/** Lets a caregiver add CareShare to her phone's home screen; the app itself stays a server-rendered site. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CareShare",
    short_name: "CareShare",
    description: "A verified, shared care record for families managing dementia and the clinic that looks after them.",
    start_url: "/care",
    display: "standalone",
    background_color: "#f8f5ee",
    theme_color: "#f8f5ee",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
