import { Link, useLocation } from "wouter";
import { Shield, User, Sparkles } from "lucide-react";
import { useStore } from "@/store/use-store";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";

export function Navbar() {
  const [location] = useLocation();
  const userProfileId = useStore((state) => state.userProfileId);
  const colorTheme = useStore((state) => state.colorTheme);
  const isTerminal = colorTheme === "terminal";

  return (
    <header className={`sticky top-0 z-50 w-full border-b border-border/40 backdrop-blur-md ${isTerminal ? "bg-background/90" : "bg-background/80"}`}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className={`w-10 h-10 bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors ${isTerminal ? "rounded-lg" : "rounded-xl"}`}>
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <span className="font-display font-bold text-xl text-foreground">
            {isTerminal ? (
              <>
                <span className="text-primary">~/</span>Insure<span className="text-primary">Wise</span>
              </>
            ) : (
              <>Insure<span className="text-primary">Wise</span></>
            )}
          </span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/compare"
            className={`text-sm font-medium transition-colors hover:text-primary ${location === '/compare' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {isTerminal ? "compare" : "Compare Policies"}
          </Link>

          <Link
            href="/optimizer"
            className={`flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary ${location === '/optimizer' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Sparkles size={15} />
            {isTerminal ? "optimize" : "Optimizer"}
          </Link>

          <ThemeSwitcher />

          {userProfileId ? (
            <Link
              href="/profile"
              className={`flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors ${isTerminal ? "rounded-lg" : "rounded-full"}`}
            >
              <User className="w-4 h-4" />
              <span>{isTerminal ? "profile" : "Profile"}</span>
            </Link>
          ) : (
            <Link
              href="/onboard"
              className={`px-5 py-2 bg-primary text-primary-foreground font-medium shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all ${isTerminal ? "rounded-lg" : "rounded-full"}`}
            >
              {isTerminal ? "get-started" : "Get Started"}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
