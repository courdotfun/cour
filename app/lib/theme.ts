// Theme system ported from v8 (header <script>). Themes cycle cartoon → light.
// "classic" = dark (no theme-cartoon class). Persisted under cour-* (migrated from
// the old eon-* keys).
export type Theme = "classic" | "cartoon" | "light";
export const THEMES: Theme[] = ["cartoon", "light"];
const KEY = "cour-theme";
const LIGHT_KEY = "cour-light";

export function setTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  const B = document.body;
  B.classList.toggle("theme-cartoon", t !== "classic");
  B.classList.toggle("theme-light", t === "light");
  B.classList.remove("l-pink");
  if (t === "light") B.classList.add("l-pink");
  B.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
    if (t === "light") localStorage.setItem(LIGHT_KEY, "pink");
  } catch {}
}

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "cartoon";
  return (document.body.dataset.theme as Theme) || "cartoon";
}

export function toggleTheme(): void {
  const cur = currentTheme();
  setTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
}

export function nextThemeLabel(): string {
  const cur = currentTheme();
  const nxt = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  return nxt === "cartoon" ? "Dark" : "Light";
}
