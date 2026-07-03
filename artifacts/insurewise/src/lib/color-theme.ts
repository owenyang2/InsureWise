export type ColorTheme = "classic" | "terminal";

export const COLOR_THEMES: { value: ColorTheme; label: string }[] = [
  { value: "classic", label: "Classic Blue" },
  { value: "terminal", label: "Terminal Green" },
];

export function applyColorTheme(theme: ColorTheme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function readStoredColorTheme(): ColorTheme {
  try {
    const stored = localStorage.getItem("insurewise-storage");
    if (!stored) return "classic";

    const parsed = JSON.parse(stored) as { state?: { colorTheme?: string } };
    if (parsed.state?.colorTheme === "terminal" || parsed.state?.colorTheme === "classic") {
      return parsed.state.colorTheme;
    }
  } catch {
    // ignore malformed storage
  }
  return "classic";
}
