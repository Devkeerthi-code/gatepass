import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GatePass scanner",
    short_name: "GatePass",
    description: "Scan concert tickets at the gate, even with a weak connection.",
    start_url: "/scan",
    display: "standalone",
    background_color: "#f4f0e8",
    theme_color: "#f4f0e8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
