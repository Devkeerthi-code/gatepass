"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "auto" | "dark";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** Light is the designed default; people can opt into dark or follow their phone. Saved per device. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let saved: Theme = "light";
    try {
      const v = localStorage.getItem("gp-theme");
      if (v === "dark" || v === "auto") saved = v;
    } catch {
      // storage blocked (private mode): stay on light
    }
    // Sync React state with the value the pre-paint script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved);
  }, []);

  const choose = (t: Theme) => {
    setTheme(t);
    apply(t);
    try {
      localStorage.setItem("gp-theme", t);
    } catch {
      // ignore: the choice just won't persist
    }
  };

  return (
    <div className="seg seg-sm" role="radiogroup" aria-label="Colour theme">
      {(["light", "auto", "dark"] as const).map((t) => (
        <label key={t}>
          <input type="radio" name="gp-theme" checked={theme === t} onChange={() => choose(t)} />
          <span>{t === "light" ? "Light" : t === "auto" ? "Auto" : "Dark"}</span>
        </label>
      ))}
    </div>
  );
}
