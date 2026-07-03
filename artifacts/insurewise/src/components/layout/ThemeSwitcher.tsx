import { Palette } from "lucide-react";
import { useStore } from "@/store/use-store";
import { COLOR_THEMES, isColorTheme } from "@/lib/color-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const THEME_SWATCH: Record<string, string> = {
  classic: "bg-[hsl(221,83%,53%)]",
  terminal: "bg-[hsl(120,100%,40%)]",
};

export function ThemeSwitcher() {
  const colorTheme = useStore((state) => state.colorTheme);
  const setColorTheme = useStore((state) => state.setColorTheme);
  const activeLabel =
    COLOR_THEMES.find((theme) => theme.value === colorTheme)?.label ?? "Classic Blue";

  return (
    <Select
      value={colorTheme}
      onValueChange={(value) => {
        if (isColorTheme(value)) setColorTheme(value);
      }}
    >
      <SelectTrigger
        className="h-9 w-auto min-w-[11.75rem] max-w-[13rem] border-border/60 bg-background/80 gap-2"
        aria-label="Color theme"
      >
        <Palette className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${THEME_SWATCH[colorTheme]}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-left">{activeLabel}</span>
      </SelectTrigger>
      <SelectContent>
        {COLOR_THEMES.map((theme) => (
          <SelectItem key={theme.value} value={theme.value}>
            <span className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${THEME_SWATCH[theme.value]}`}
                aria-hidden
              />
              {theme.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
