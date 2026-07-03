import { Palette } from "lucide-react";
import { useStore } from "@/store/use-store";
import { COLOR_THEMES, type ColorTheme } from "@/lib/color-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ThemeSwitcher() {
  const colorTheme = useStore((state) => state.colorTheme);
  const setColorTheme = useStore((state) => state.setColorTheme);

  return (
    <Select value={colorTheme} onValueChange={(value) => setColorTheme(value as ColorTheme)}>
      <SelectTrigger
        className="w-[9.5rem] h-9 border-border/60 bg-background/80"
        aria-label="Color theme"
      >
        <div className="flex items-center gap-2">
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {COLOR_THEMES.map((theme) => (
          <SelectItem key={theme.value} value={theme.value}>
            {theme.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
