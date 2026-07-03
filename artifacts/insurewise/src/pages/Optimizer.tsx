import { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, TrendingDown, Loader2, AlertCircle,
  MapPin, CreditCard, Shield, Car, Zap, Package, Leaf,
  ChevronRight, ArrowRight, RefreshCw, User
} from "lucide-react";
import { useGetUserProfile } from "@workspace/api-client-react";
import { useStore } from "@/store/use-store";
import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OptimizationTip {
  id: string;
  title: string;
  description: string;
  category: string;
  minSavings: number;
  maxSavings: number;
  impact: "high" | "medium" | "low";
  actionLabel: string;
  profileField: string | null;
}

interface OptimizationResult {
  tips: OptimizationTip[];
  personalizedQuote: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  location: { icon: <MapPin size={18} />, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
  credit: { icon: <CreditCard size={18} />, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
  deductible: { icon: <Shield size={18} />, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
  bundling: { icon: <Package size={18} />, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
  vehicle: { icon: <Car size={18} />, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
  safety: { icon: <Zap size={18} />, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
  lifestyle: { icon: <Leaf size={18} />, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
};

const IMPACT_COLOR: Record<string, string> = {
  high: "bg-destructive/15 text-destructive border-destructive/20",
  medium: "bg-accent text-foreground border-border",
  low: "bg-primary/15 text-primary border-primary/20",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Optimizer() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const userProfileId = useStore((state) => state.userProfileId);
  const isTerminal = useStore((state) => state.colorTheme) === "terminal";

  const { data: profile, isLoading: isProfileLoading } = useGetUserProfile({
    query: {
      enabled: !!userProfileId,
      queryKey: ["getUserProfile"]
    }
  });

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const runAnalysis = async () => {
    if (!profile) return;
    setIsAnalyzing(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/insurance/optimize-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      if (!res.ok) throw new Error("Failed");
      setResult(await res.json());
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const totalEstimatedSavings = result?.tips
    .map(t => {
      const min = Number(t.minSavings) || 0;
      const max = Number(t.maxSavings) || 0;
      return Math.round((min + max) / 2);
    })
    .reduce((a, b) => a + b, 0) ?? 0;

  // ── No profile ─────────────────────────────────────────────────────────────
  if (!userProfileId || (!isProfileLoading && !profile)) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-display font-bold mb-3">Premium Optimizer</h1>
            <p className="text-muted-foreground mb-8">
              Create your profile first so we can give you personalized, location-specific tips to lower your premium.
            </p>
            <Link
              href="/onboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
            >
              Build My Profile <ArrowRight size={18} />
            </Link>
          </motion.div>
        </main>
      </div>
    );
  }

  // ── Loading profile ─────────────────────────────────────────────────────────
  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-12 max-w-4xl">

        {/* ── Hero header ───────────────────────────────────────────────── */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4"
          >
            <Sparkles size={14} /> AI-Powered Savings
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-4xl font-display font-bold mb-3"
          >
            Premium Optimizer
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-lg max-w-xl mx-auto"
          >
            Personalized, hyper-specific tips based on your exact location, vehicle, and coverage to lower what you pay every month.
          </motion.p>
        </div>

        {/* ── Profile summary card ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card rounded-2xl border border-border shadow-md p-5 mb-6 flex items-center justify-between gap-4 flex-wrap"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <User size={22} />
            </div>
            <div>
              <div className="font-bold text-lg">{profile!.name}</div>
              <div className="text-sm text-muted-foreground capitalize">
                {profile!.insuranceType} insurance · {profile!.location} · ${profile!.budgetMonthly}/mo budget
              </div>
            </div>
          </div>
          <Link
            href="/profile"
            className="text-sm text-primary font-medium flex items-center gap-1 hover:underline"
          >
            Edit Profile <ChevronRight size={14} />
          </Link>
        </motion.div>

        {/* ── Analyze button ────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center mb-10"
        >
          <button
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 disabled:opacity-60 transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
          >
            {isAnalyzing ? (
              <><Loader2 size={22} className="animate-spin" /> Analyzing your profile...</>
            ) : result ? (
              <><RefreshCw size={22} /> Re-analyze</>
            ) : (
              <><TrendingDown size={22} /> Analyze My Premium</>
            )}
          </button>
        </motion.div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">

          {/* Analyzing state */}
          {isAnalyzing && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-16 space-y-3"
            >
              <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
              <p className="font-semibold text-xl">Checking rates in {profile!.location}...</p>
              <p className="text-muted-foreground">Finding every discount and opportunity specific to you</p>
            </motion.div>
          )}

          {/* Error state */}
          {error && !isAnalyzing && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 p-5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive"
            >
              <AlertCircle size={20} />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Results */}
          {result && !isAnalyzing && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Total savings banner */}
              <div className="bg-primary rounded-2xl p-6 text-primary-foreground flex items-center justify-between gap-4 flex-wrap shadow-lg">
                <div>
                  <div className="text-sm font-medium opacity-80 mb-1">
                    {isTerminal ? "> potential_monthly_savings" : "Potential monthly savings"}
                  </div>
                  <div className="text-4xl font-display font-bold">~${totalEstimatedSavings}/mo</div>
                  <div className="text-sm opacity-75 mt-1">if you act on all 5 recommendations</div>
                </div>
                <TrendingDown className="w-16 h-16 opacity-20" />
              </div>

              {/* Personalized quote */}
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex gap-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <p className="text-sm font-medium leading-relaxed text-foreground">
                  {result.personalizedQuote}
                </p>
              </div>

              {/* Tips grid */}
              <div className="space-y-4">
                {result.tips.map((tip, idx) => {
                  const meta = CATEGORY_META[tip.category] ?? CATEGORY_META.safety;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className={`rounded-2xl border ${meta.border} ${meta.bg} p-6`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Category icon */}
                        <div className={`w-10 h-10 rounded-xl ${meta.bg} border ${meta.border} flex items-center justify-center ${meta.color} shrink-0 mt-0.5`}>
                          {meta.icon}
                        </div>

                        {/* Body */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-bold text-foreground">{tip.title}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${IMPACT_COLOR[tip.impact]}`}>
                              {tip.impact} impact
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{tip.description}</p>

                          {tip.profileField && tip.profileField !== "null" && (
                            <Link
                              href="/profile"
                              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${meta.color} hover:opacity-75 transition-opacity`}
                            >
                              {tip.actionLabel} <ChevronRight size={14} />
                            </Link>
                          )}
                        </div>

                        {/* Savings badge */}
                        <div className="shrink-0 text-right">
                          <div className="text-xl font-bold text-primary whitespace-nowrap">${Number(tip.minSavings) || 0}–${Number(tip.maxSavings) || 0}/mo</div>
                          <div className="text-xs text-muted-foreground">est. savings</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* CTA */}
              <div className="text-center pt-4">
                <p className="text-muted-foreground text-sm mb-4">Ready to find a policy that fits these savings?</p>
                <Link
                  href="/compare"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                >
                  Compare Policies <ArrowRight size={18} />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
