import { useEffect } from "react";
import { useStore } from "@/store/use-store";
import { applyColorTheme } from "@/lib/color-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorTheme = useStore((state) => state.colorTheme);

  useEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

  return children;
}
