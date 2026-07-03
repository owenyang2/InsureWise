import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Shield, AlertTriangle, Check, SlidersHorizontal, ChevronRight, SearchX, ExternalLink, Star, Layers, Sparkles } from "lucide-react";
import { useSearchPolicies, useGetUserProfile } from "@workspace/api-client-react";
import type { PolicyCard } from "@workspace/api-client-react";
import { useStore } from "@/store/use-store";
import { Navbar } from "@/components/layout/Navbar";
import { LoadingAgents } from "@/components/ui/LoadingAgents";

export default function Compare() {
  const [location, setLocation] = useLocation();
  const userProfileId = useStore((state) => state.userProfileId);
  const isTerminal = useStore((state) => state.colorTheme) === "terminal";
  const { data: profile, isLoading: isProfileLoading } = useGetUserProfile({
    query: {
      enabled: !!userProfileId,
      queryKey: ["getUserProfile", userProfileId]
    }
  });

  const searchMutation = useSearchPolicies();
  const [policies, setPolicies] = useState<PolicyCard[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchedUpdate, setLastSearchedUpdate] = useState<string | null>(null);

  // Local sliders for dynamic re-ranking
  const [priceWeight, setPriceWeight] = useState(33);
  const [coverageWeight, setCoverageWeight] = useState(33);
  const [ratingWeight, setRatingWeight] = useState(34);
  const [validWeights, setValidWeights] = useState({ price: 33, coverage: 33, rating: 34 });

  useEffect(() => {
    if (!userProfileId) {
      setLocation("/onboard");
    }
  }, [userProfileId, setLocation]);

  useEffect(() => {
    // If we have a profile and aren't currently searching, check if we need to search
    // We search if we've never searched, OR if the profile recently updated (date mismatch)
    if (profile && !searchMutation.isPending) {
      if (!hasSearched || (profile.updatedAt as unknown as string) !== lastSearchedUpdate) {
        setPriceWeight(profile.priorities.price);
        setCoverageWeight(profile.priorities.coverage);
        setRatingWeight(profile.priorities.rating);
        setValidWeights({
          price: profile.priorities.price,
          coverage: profile.priorities.coverage,
          rating: profile.priorities.rating
        });

        searchMutation.mutate({
          data: {
            userProfileId: profile.id,
            insuranceType: profile.insuranceType,
            priorities: profile.priorities,
            requirements: profile.requirements,
            budgetMonthly: profile.budgetMonthly,
            location: profile.location
          }
        }, {
          onSuccess: (res) => {
            setPolicies(res.policies);
            setHasSearched(true);
            setLastSearchedUpdate(profile.updatedAt as unknown as string);
          }
        });
      }
    }
  }, [profile, hasSearched, searchMutation.isPending, userProfileId, lastSearchedUpdate]);

  const currentTotal = priceWeight + coverageWeight + ratingWeight;
  const isWeightValid = currentTotal === 100;

  useEffect(() => {
    if (isWeightValid) {
      setValidWeights({
        price: priceWeight,
        coverage: coverageWeight,
        rating: ratingWeight
      });
    }
  }, [isWeightValid, priceWeight, coverageWeight, ratingWeight]);

  // Client-side re-ranking based on sliders (higher weighted score = better)
  const rankedPolicies = useMemo(() => {
    return [...policies].sort((a, b) => {
      const scoreA = (a.priceScore * validWeights.price + a.coverageScore * validWeights.coverage + a.ratingScore * validWeights.rating) / 100;
      const scoreB = (b.priceScore * validWeights.price + b.coverageScore * validWeights.coverage + b.ratingScore * validWeights.rating) / 100;
      return scoreB - scoreA;
    });
  }, [policies, validWeights]);

  /** Weighted match score 0–100 for display (API scores are 0–1) */
  const getDisplayScore = (policy: PolicyCard) => {
    const raw = (policy.priceScore * validWeights.price + policy.coverageScore * validWeights.coverage + policy.ratingScore * validWeights.rating) / 100;
    return Math.min(100, Math.round(raw * 100));
  };

  if (isProfileLoading || searchMutation.isPending || !hasSearched) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <LoadingAgents />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">

          {/* Sidebar / Filters */}
          <aside className="w-full md:w-80 flex-shrink-0">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto custom-scrollbar pr-2 pb-4 space-y-6">
              <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-lg">Priority Weights</h2>
              </div>
              <div className="flex items-center justify-between mb-8">
                <div className="h-10 flex items-center mr-2">
                  {isWeightValid ? (
                    <p className="text-sm text-muted-foreground">
                      Adjust sliders to re-rank policies.
                    </p>
                  ) : (
                    <div className="py-2 px-3 bg-destructive/10 text-destructive text-xs rounded-lg flex items-center gap-2 border border-destructive/20 shadow-sm animate-in fade-in slide-in-from-left-2 duration-200">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="font-medium">Must sum to 100%</span>
                    </div>
                  )}
                </div>
                <span className={`text-xs font-bold px-2 py-1 flex-shrink-0 rounded-full transition-colors ${isWeightValid ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
                  Total: {currentTotal}%
                </span>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">Price</label>
                    <span className="text-sm font-bold text-primary">{priceWeight}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    value={priceWeight}
                    onChange={(e) => setPriceWeight(Math.min(Number(e.target.value), 100 - coverageWeight - ratingWeight))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">Coverage</label>
                    <span className="text-sm font-bold text-primary">{coverageWeight}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    value={coverageWeight}
                    onChange={(e) => setCoverageWeight(Math.min(Number(e.target.value), 100 - priceWeight - ratingWeight))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">Rating</label>
                    <span className="text-sm font-bold text-primary">{ratingWeight}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    value={ratingWeight}
                    onChange={(e) => setRatingWeight(Math.min(Number(e.target.value), 100 - priceWeight - coverageWeight))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>
            </div>

            {/* ── Captured Details ─────────────────────────────────────────── */}
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm flex flex-col">
              <h2 className="font-bold text-lg text-primary mb-4 flex items-center gap-2 shrink-0">
                <Sparkles className="w-5 h-5" /> captured_details
              </h2>
              <div className="flex flex-col gap-3">
                {profile && Object.entries(profile)
                  .filter(([k, v]) => 
                    v !== null && 
                    v !== undefined && 
                    k !== "id" && 
                    k !== "createdAt" && 
                    k !== "updatedAt" && 
                    k !== "onboardingComplete" &&
                    k !== "priorities" &&
                    k !== "vehicleDetails" &&
                    k !== "propertyDetails" &&
                    k !== "requirements"
                  )
                  .map(([k, v]) => {
                    let displayValue = "";
                    if (typeof v === 'object') {
                      displayValue = JSON.stringify(v);
                    } else if (typeof v === 'boolean') {
                      displayValue = v ? "Yes" : "No";
                    } else {
                      displayValue = String(v);
                    }

                    return (
                      <div key={k} className="bg-background rounded-lg p-3 shadow-sm border border-border">
                        <span className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider block mb-0.5">
                          {k.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span className="text-xs font-medium text-foreground block capitalize">
                          {displayValue}
                        </span>
                      </div>
                    );
                })}

                {profile?.vehicleDetails && Object.entries(profile.vehicleDetails).map(([k, v]) => (
                    <div key={`vehicle-${k}`} className="bg-background rounded-lg p-3 shadow-sm border border-border">
                      <span className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider block mb-0.5">
                        Vehicle {k.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="text-xs font-medium text-foreground block capitalize">
                        {String(v)}
                      </span>
                    </div>
                ))}

                {profile?.propertyDetails && Object.entries(profile.propertyDetails).map(([k, v]) => (
                    <div key={`property-${k}`} className="bg-background rounded-lg p-3 shadow-sm border border-border">
                      <span className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider block mb-0.5">
                        Property {k.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="text-xs font-medium text-foreground block capitalize">
                        {String(v)}
                      </span>
                    </div>
                ))}

                {profile?.requirements && profile.requirements.length > 0 && (
                    <div className="bg-background rounded-lg p-3 shadow-sm border border-border">
                      <span className="text-[10px] font-semibold text-primary/60 uppercase tracking-wider block mb-1.5">
                        Requirements
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.requirements.map((req, i) => (
                          <span key={i} className="text-[10px] font-medium text-foreground bg-primary/10 px-2 py-0.5 rounded">
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>
                )}
              </div>
            </div>
            </div>
          </aside>

          {/* Results Grid */}
          <div className="flex-1">
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold text-foreground mb-2">Top Matches for You</h1>
              <p className="text-muted-foreground">Found {rankedPolicies.length} policies matching your profile.</p>
            </div>

            {rankedPolicies.length === 0 ? (
              <div className="bg-card rounded-2xl p-12 text-center border border-border">
                <SearchX className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">No policies found</h3>
                <p className="text-muted-foreground">Try adjusting your requirements or budget.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {rankedPolicies.map((policy, idx) => {
                  const score = getDisplayScore(policy);

                  return (
                    <div key={policy.id} className="bg-card rounded-2xl border border-border shadow-md shadow-black/20 hover:shadow-xl hover:border-primary/30 transition-all duration-300 overflow-hidden">
                      {idx === 0 && (
                        <div className="bg-primary px-4 py-1.5 text-center">
                          <span className="text-xs font-bold text-primary-foreground uppercase tracking-wider">
                            {isTerminal ? "> BEST OVERALL MATCH" : "Best Overall Match"}
                          </span>
                        </div>
                      )}

                      <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center">
                        {/* Insurer Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center font-bold text-xl text-primary">
                              {policy.insurerName.charAt(0)}
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-foreground">{policy.insurerName}</h3>
                              <p className="text-sm text-muted-foreground">{policy.planName}</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 mt-4">
                            {policy.gapCount === 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-sm font-medium">
                                <Check className="w-4 h-4" /> No Coverage Gaps
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent text-foreground text-sm font-medium">
                                <AlertTriangle className="w-4 h-4" /> {policy.gapCount} Coverage Gaps
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-foreground text-sm font-medium" title="Amount you pay out of pocket before insurance pays. Lower deductible usually means higher premium.">
                              <Shield className="w-4 h-4" /> ${policy.deductible} Deductible
                            </span>
                          </div>

                          {/* Rating & Coverage — so users see relative ratings */}
                          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                            <div className="flex items-center gap-1.5" title="Insurer rating (out of 5)">
                              <Star className="w-4 h-4 fill-primary text-primary" />
                              <span className="font-semibold text-foreground">{policy.overallRating.toFixed(1)}</span>
                              <span className="text-muted-foreground">/ 5</span>
                              {policy.reviewCount > 0 && (
                                <span className="text-muted-foreground">({policy.reviewCount.toLocaleString()} reviews)</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5" title="Relative coverage strength vs other quotes (liability, deductibles, add-ons). Higher = stronger coverage options for this quote.">
                              <Layers className="w-4 h-4 text-primary" />
                              <span className="font-semibold text-foreground">{Math.round((policy.coverageScore ?? 0) * 100)}%</span>
                              <span className="text-muted-foreground">coverage</span>
                            </div>
                          </div>
                          {policy.coverageSummary && policy.coverageSummary.length > 0 && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {policy.coverageSummary.slice(0, 5).map(c => c.name).join(" · ")}
                              {policy.coverageSummary.length > 5 ? " …" : ""}
                            </p>
                          )}
                        </div>

                        {/* Price & Score */}
                        <div className="flex flex-row md:flex-col items-center justify-between md:justify-center md:border-l border-border md:pl-8 gap-4">
                          <div className="text-center md:text-right">
                            <p className="text-sm text-muted-foreground mb-1">Monthly Premium</p>
                            <p className="text-4xl font-bold text-foreground">${policy.monthlyPremium}</p>
                          </div>

                          <div className="flex flex-col items-center">
                            <div className="relative w-16 h-16 flex items-center justify-center">
                              <svg className="w-full h-full transform -rotate-90">
                                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted" />
                                <circle
                                  cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="8" fill="transparent"
                                  strokeDasharray={2 * Math.PI * 28}
                                  strokeDashoffset={2 * Math.PI * 28 * (1 - score / 100)}
                                  className={`${score > 85 ? 'text-primary' : score > 70 ? 'text-foreground' : 'text-destructive'} transition-all duration-1000`}
                                />
                              </svg>
                              <span className="absolute text-lg font-bold">{score}%</span>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground mt-1">Match Score</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="md:border-l border-border md:pl-8 flex md:flex-col gap-3 justify-center">
                          {"url" in policy && typeof (policy as PolicyCard & { url?: string }).url === "string" && (
                            <a
                              href={(policy as PolicyCard & { url: string }).url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Visit {policy.insurerName}
                            </a>
                          )}
                          <Link
                            href={`/policy/${policy.id}`}
                            className="flex-1 md:flex-none px-6 py-3 rounded-xl bg-primary/10 text-primary font-semibold text-center hover:bg-primary hover:text-white transition-colors flex items-center justify-center gap-2"
                          >
                            AI Analysis
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
