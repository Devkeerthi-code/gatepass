import type { CSSProperties } from "react";

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * CSS variables for a host-chosen accent: text on it is dark or white, whichever reads better,
 * and the soft tint is derived from the same hue so chips match the concert's colour.
 */
export function accentVars(hex: string): CSSProperties {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#D4136F";
  const ink = contrastRatio(safe, "#ffffff") >= contrastRatio(safe, "#16130f") ? "#ffffff" : "#16130f";
  return {
    ["--accent" as string]: safe,
    ["--accent-ink" as string]: ink,
    ["--accent-soft" as string]: `color-mix(in srgb, ${safe} 14%, #fffdf8)`,
  } as CSSProperties;
}
