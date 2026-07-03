export type ColorTheme = "classic" | "terminal";

export const COLOR_THEMES: { value: ColorTheme; label: string }[] = [
  { value: "classic", label: "Classic Blue" },
  { value: "terminal", label: "Terminal Green" },
];

export function isColorTheme(value: unknown): value is ColorTheme {
  return value === "classic" || value === "terminal";
}

export function applyColorTheme(theme: unknown) {
  const resolved = isColorTheme(theme) ? theme : "classic";
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
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
