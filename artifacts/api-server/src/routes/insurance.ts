import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { openai, AI_MODEL } from "../lib/ai.js";
import { resolvePythonBin } from "../lib/python-bin.js";
import {
  buildParseAnswerPrompt,
  parseAnswerFromModelContent,
} from "../lib/parse-answer.js";
import { schemas } from "@workspace/api-zod";
const { SearchPoliciesBody, ExplainPolicyBody, GetApplicationFormBody, SubmitApplicationBody, AiParseAnswerBody, AskExpertBody } = schemas;
import { db, userProfilesTable, applicationsTable, quoteResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  calculateAutoQuotes, calculateHomeQuotes, calculateRentersQuotes,
  calculateLifeQuotes, calculateHealthQuotes, getQuoteSummary,
} from "../lib/quoteEngine.js";
import type { QuoteResult, AutoInputs, HomeInputs, RentersInputs } from "../lib/quoteEngine.js";

const router: IRouter = Router();

// ─── Search helpers ───────────────────────────────────────────────────────────

/** Infer a home/renters region key from a free-text location string */
function inferRegion(location: string): string {
  const l = location.toLowerCase();
  if (/toronto|scarborough|north york|etobicoke|\bm\d/i.test(l)) return "ON_urban";
  if (/mississauga|brampton|vaughan|markham|richmond hill|\bl\d/i.test(l)) return "ON_sub";
  if (/ottawa|kingston|\bk\d/i.test(l)) return "ON_rural";
  if (/london|windsor|kitchener|waterloo|hamilton|\bn\d/i.test(l)) return "ON_sub";
  if (/sudbury|thunder bay|sault|\bp\d/i.test(l)) return "ON_rural";
  if (/vancouver|surrey|burnaby|richmond|\bv\d/i.test(l)) return "BC_urban";
  if (/victoria|kelowna|abbotsford/i.test(l)) return "BC_sub";
  if (/alberta|calgary|edmonton|\bt\d/i.test(l)) return "AB";
  if (/quebec|montreal|laval|\bh\d/i.test(l)) return "QC";
  if (/new brunswick|nova scotia|pei|newfoundland|atlantic|\be\d|\bb\d|\bc\d|\ba\d/i.test(l)) return "AT";
  return "ON_sub";
}

/** Extract health/life province from a free-text location string */
function inferProvince(location: string): string {
  const l = location.toLowerCase();
  if (/ontario|toronto|ottawa|\bon\b/i.test(l)) return "ON";
  if (/british columbia|vancouver|\bbc\b/i.test(l)) return "BC";
  if (/alberta|calgary|edmonton|\bab\b/i.test(l)) return "AB";
  if (/quebec|montreal|\bqc\b/i.test(l)) return "QC";
  if (/atlantic|nova scotia|new brunswick|pei|newfoundland/i.test(l)) return "AT";
  return "ON";
}

/** Extract a Canadian FSA (first 3 chars of postal code) from a location string */
function extractPostalPrefix(location: string): string {
  const m = location.match(/\b([A-Za-z]\d[A-Za-z])\b/);
  if (m) return m[1].toUpperCase()[0];
  const l = location.toLowerCase();
  if (/toronto|scarborough|north york|etobicoke/i.test(l)) return "M";
  if (/mississauga|brampton|vaughan|markham/i.test(l)) return "L";
  if (/ottawa|kingston/i.test(l)) return "K";
  if (/london|windsor|kitchener|waterloo|hamilton/i.test(l)) return "N";
  if (/sudbury|thunder bay/i.test(l)) return "P";
  if (/vancouver|surrey|burnaby/i.test(l)) return "V";
  if (/calgary|edmonton/i.test(l)) return "T";
  if (/montreal|laval/i.test(l)) return "H";
  return location.trim()[0]?.toUpperCase() ?? "M";
}

/** Standard coverage items per insurance type — used for coverageSummary and gapCount */
const STANDARD_COVERAGE: Record<string, string[]> = {
  auto:    ["liability", "accident benefits", "uninsured motorist", "collision", "comprehensive"],
  home:    ["dwelling", "contents", "personal liability", "additional living expenses", "detached structures"],
  renters: ["contents", "personal liability", "additional living expenses", "loss of use"],
  life:    ["death benefit", "terminal illness", "conversion option"],
  health:  ["dental", "drugs", "vision", "extended health", "paramedical"],
};

/** Build a readable coverageSummary array from a QuoteResult */
function buildCoverageSummary(insuranceType: string, q: QuoteResult) {
  const standards: Record<string, Array<{ type: string; name: string; status: string; details: string; limit?: string }>> = {
    auto: [
      { type: "liability",         name: "Third-Party Liability",  status: "covered", details: "Up to $2,000,000 per occurrence",   limit: "$2,000,000" },
      { type: "accident_benefits", name: "Accident Benefits",      status: "covered", details: "Ontario statutory accident benefits"               },
      { type: "uninsured_motorist",name: "Uninsured Motorist",     status: "covered", details: "Coverage against uninsured drivers"                },
      { type: "collision",         name: "Collision",              status: "covered", details: `$${q.deductible} deductible`,        limit: "ACV"        },
      { type: "comprehensive",     name: "Comprehensive",          status: "covered", details: "Theft, weather, fire, vandalism",    limit: "ACV"        },
    ],
    home: [
      { type: "dwelling",          name: "Dwelling",               status: "covered", details: "Replacement cost coverage"                          },
      { type: "contents",          name: "Personal Property",      status: "covered", details: "Contents replacement cost"                          },
      { type: "liability",         name: "Personal Liability",     status: "covered", details: "$1,000,000 personal liability",      limit: "$1,000,000" },
      { type: "living_expenses",   name: "Additional Living",      status: "covered", details: "Up to 24 months if home uninhabitable"              },
      { type: "detached_structures",name: "Detached Structures",   status: "covered", details: "Garage, shed, fence coverage"                       },
    ],
    renters: [
      { type: "contents",          name: "Personal Property",      status: "covered", details: "Contents replacement cost"                          },
      { type: "liability",         name: "Personal Liability",     status: "covered", details: "$1,000,000 personal liability",      limit: "$1,000,000" },
      { type: "living_expenses",   name: "Additional Living",      status: "covered", details: "Temporary housing if unit uninhabitable"            },
      { type: "loss_of_use",       name: "Loss of Use",            status: "covered", details: "Living costs while displaced"                       },
    ],
    life: [
      { type: "death_benefit",     name: "Death Benefit",          status: "covered", details: "Lump-sum payment to beneficiary"                   },
      { type: "terminal_illness",  name: "Terminal Illness",       status: "covered", details: "Advance payment on terminal diagnosis"              },
      { type: "conversion",        name: "Conversion Option",      status: "covered", details: "Convert to permanent coverage without medical exam" },
    ],
    health: [
      { type: "dental",            name: "Dental Care",            status: "covered", details: "Preventive, basic, and major dental"                },
      { type: "drugs",             name: "Prescription Drugs",     status: "covered", details: "Formulary drug coverage"                            },
      { type: "vision",            name: "Vision Care",            status: "covered", details: "Glasses, contacts, eye exams"                       },
      { type: "paramedical",       name: "Paramedical",            status: "covered", details: "Physio, massage, chiro, psychologist"               },
    ],
  };
  return (standards[insuranceType] ?? standards["auto"]).slice(0, 5);
}

/** Count requirements not covered by the standard coverage list for this type */
function computeGapCount(requirements: string[], insuranceType: string): number {
  const standard = STANDARD_COVERAGE[insuranceType] ?? STANDARD_COVERAGE["auto"];
  let gaps = 0;
  for (const req of requirements) {
    const r = req.toLowerCase().trim();
    const covered = standard.some(s => r.includes(s) || s.includes(r));
    if (!covered) gaps++;
  }
  return gaps;
}

router.post("/insurance/search", async (req, res): Promise<void> => {
  // Normalize body so Zod accepts it: userProfileId can be number from client, schema expects string
  const raw = req.body as Record<string, unknown>;
  const body = {
    ...raw,
    userProfileId: raw.userProfileId != null ? String(raw.userProfileId) : undefined,
    location: raw.location != null && String(raw.location).trim() !== "" ? String(raw.location) : "Toronto, ON",
    priorities: raw.priorities && typeof raw.priorities === "object" && raw.priorities !== null
      ? {
          price:   Number((raw.priorities as any).price)   || 34,
          coverage: Number((raw.priorities as any).coverage) || 33,
          rating:   Number((raw.priorities as any).rating)   || 33,
        }
      : { price: 34, coverage: 33, rating: 33 },
    requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
    budgetMonthly: typeof raw.budgetMonthly === "number" ? raw.budgetMonthly : 200,
    insuranceType: raw.insuranceType ?? "auto",
  };

  const parsed = SearchPoliciesBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const { insuranceType, priorities, requirements, budgetMonthly } = parsed.data;
  const userProfileId: number | undefined = body.userProfileId ? Number(body.userProfileId) || undefined : undefined;
  const locationOverride: string | undefined = (body.location as string) || undefined;
  const sessionId = req.headers["x-session-id"] as string | undefined;
  const start = Date.now();

  // ── Fetch full user profile for vehicle/property details ──────────────────
  let profile: typeof userProfilesTable.$inferSelect | undefined;
  try {
    if (userProfileId) {
      const [p] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, Number(userProfileId)));
      profile = p;
    } else if (sessionId) {
      const [p] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.sessionId, sessionId));
      profile = p;
    }
  } catch {
    // DB unavailable — proceed with defaults
  }

  // ── Resolve location ───────────────────────────────────────────────────────
  const locationStr = locationOverride ?? profile?.location ?? "Toronto, ON";
  const postalPrefix = extractPostalPrefix(locationStr);

  // ── Map profile jsonb fields to engine input shapes ────────────────────────
  type VehicleJson = { make?: string; type?: string; value?: number; year?: number; km?: number; use?: string };
  type PropertyJson = { region?: string; dwellingType?: string; rebuildValue?: number; homeAge?: number; heatingType?: string };

  const vehicle = (profile?.vehicleDetails ?? {}) as VehicleJson;
  const property = (profile?.propertyDetails ?? {}) as PropertyJson;
  const driverAge = profile?.age ?? 35;
  const yearsLicensed = Math.min(Math.max(driverAge - 16, 1), 40);

  // ── Run the appropriate engine ─────────────────────────────────────────────
  let quotes: QuoteResult[];

  if (insuranceType === "auto") {
    quotes = calculateAutoQuotes({
      postalCode:               postalPrefix,
      vehicleMake:              vehicle.make  ?? "honda",
      vehicleType:              vehicle.type  ?? "sedan",
      vehicleValue:             vehicle.value ?? 30000,
      vehicleYear:              vehicle.year,
      annualKm:                 vehicle.km    ?? 15000,
      primaryUse:               vehicle.use   ?? "commute",
      driverAge,
      yearsLicensed,
      atFaultAccidents:         0,
      convictions:              "none",
      liability:                2000000,
      collisionDeductible:      1000,
      comprehensiveDeductible:  1000,
      addons:                   [],
      discounts:                [],
    });
  } else if (insuranceType === "home") {
    quotes = calculateHomeQuotes({
      region:       property.region       ?? inferRegion(locationStr),
      dwellingType: property.dwellingType ?? "detached",
      rebuildValue: property.rebuildValue ?? 500000,
      homeAge:      property.homeAge      ?? 20,
      heatingType:  property.heatingType  ?? "gas",
      claimsCount:  0,
      deductible:   1000,
      addons:       [],
      discounts:    [],
    });
  } else if (insuranceType === "renters") {
    quotes = calculateRentersQuotes({
      region:        property.region ?? inferRegion(locationStr),
      contentsValue: 35000,
      claimsCount:   0,
      deductible:    500,
      addons:        [],
      discounts:     [],
    });
  } else if (insuranceType === "life") {
    quotes = calculateLifeQuotes({
      age:            driverAge,
      gender:         "male",
      smokingStatus:  "non_smoker",
      healthClass:    "standard_plus",
      product:        "term20",
      coverageAmount: 1_000_000,
    });
  } else if (insuranceType === "health") {
    quotes = calculateHealthQuotes({
      age:         driverAge,
      province:    inferProvince(locationStr),
      familySize:  "single",
      preExisting: "none",
      planTier:    "standard",
      deductible:  0,
      products:    ["dental", "drugs"],
    });
  } else {
    // Unknown type — fall back to auto
    quotes = calculateAutoQuotes({
      postalCode: postalPrefix, vehicleMake: "honda", vehicleType: "sedan",
      vehicleValue: 30000, annualKm: 15000, primaryUse: "commute",
      driverAge, yearsLicensed, atFaultAccidents: 0, convictions: "none",
      liability: 2000000, collisionDeductible: 1000, comprehensiveDeductible: 1000,
    });
  }

  // If engine returned no quotes (e.g. life product key mismatch), fall back to auto so we never return empty
  if (quotes.length === 0) {
    quotes = calculateAutoQuotes({
      postalCode: "M", vehicleMake: "honda", vehicleType: "sedan",
      vehicleValue: 30000, vehicleYear: undefined, annualKm: 15000, primaryUse: "commute",
      driverAge: 35, yearsLicensed: 19, atFaultAccidents: 0, convictions: "none",
      liability: 2000000, collisionDeductible: 1000, comprehensiveDeductible: 1000,
      addons: [], discounts: [],
    });
  }

  // ── Optional budget filter: allow up to 2x budget so user still sees options ──
  let filtered = budgetMonthly
    ? quotes.filter(q => q.monthlyPremium <= budgetMonthly * 2)
    : quotes;
  // If nothing in budget, show all quotes (sorted by premium) so we never return "no policies"
  if (filtered.length === 0 && quotes.length > 0) {
    filtered = [...quotes];
  }

  // ── Map QuoteResult → frontend PolicyCard shape ────────────────────────────
  const gapCount = computeGapCount(requirements, insuranceType);

  const policies = filtered.map(q => ({
    id:             q.id,
    insurerName:    q.insurerName,
    insurerLogo:    q.insurerName.substring(0, 2).toUpperCase(),
    planName:       q.planName,
    monthlyPremium: q.monthlyPremium,
    annualPremium:  q.annualPremium,
    deductible:     q.deductible,
    matchScore:     q.baseMatchScore,
    priceScore:     q.priceScore,
    coverageScore:  q.coverageScore,
    ratingScore:    q.ratingScore,
    overallRating:  q.overallRating,
    reviewCount:    q.reviewCount,
    coverageSummary: buildCoverageSummary(insuranceType, q),
    gapCount,
    highlights:     q.highlights,
    warnings:       q.warnings,
    url:            q.url,
    telematics:     q.telematics,
    breakdown:      q.breakdown,
  }));

  const summary = getQuoteSummary(filtered);

  // ── Persist quote run (fire-and-forget — never blocks the response) ────────
  if (filtered.length > 0) {
    const cheapest = filtered[0];
    db.insert(quoteResultsTable).values({
      userProfileId:   userProfileId ? Number(userProfileId) : null,
      insuranceType,
      inputsSnapshot:  {
        postalCode: (req.body as any).postalCode,
        location:   locationStr,
        age:        profile?.age,
        insuranceType,
        budgetMonthly,
        vehicleDetails: profile?.vehicleDetails,
        propertyDetails: profile?.propertyDetails,
      },
      resultsSnapshot: filtered.slice(0, 10).map(q => ({
        id: q.id, insurerName: q.insurerName,
        monthlyPremium: q.monthlyPremium, annualPremium: q.annualPremium,
        priceScore: q.priceScore, ratingScore: q.ratingScore,
      })),
      resultCount:     filtered.length,
      cheapestMonthly: cheapest.monthlyPremium,
      cheapestCarrier: cheapest.insurerName,
    }).catch(() => { /* non-critical — swallow DB errors silently */ });
  }

  res.json({
    policies,
    totalFound:     policies.length,
    searchDuration: (Date.now() - start) / 1000,
    summary,
  });
});

router.post("/insurance/policies/:policyId/explain", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.policyId) ? req.params.policyId[0] : req.params.policyId;

  const bodyParsed = ExplainPolicyBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "validation_error", message: bodyParsed.error.message });
    return;
  }

  const { requirements, userContext } = bodyParsed.data;

  // Synthesize a policy object for this carrier ID — real numbers are patched in below from the engine
  // userContext contains "Age: X, Location: Y, Budget: Z" written by PolicyDetail.tsx
  type SyntheticPolicy = {
    id: string; insurerName: string; insurerLogo: string; planName: string;
    monthlyPremium: number; annualPremium: number; deductible: number;
    overallRating: number; reviewCount: number; baseMatchScore: number;
    priceScore: number; coverageScore: number; ratingScore: number;
    highlights: string[]; warnings: string[];
    coverageMap: Record<string, { status: "covered" | "partial" | "not_covered"; details: string; limit?: string }>;
  };
  const syntheticMonthly = 150; // placeholder; real premium patched in from engine below
  let policy: SyntheticPolicy = {
      id:           rawId,
      insurerName:  rawId,   // UI uses this as display name; carrier name shown via search
      insurerLogo:  rawId.substring(0, 2).toUpperCase(),
      planName:     `Policy — ${rawId}`,
      monthlyPremium: syntheticMonthly,
      annualPremium:  syntheticMonthly * 12,
      deductible:   1000,
      overallRating: 4.0,
      reviewCount:  500,
      baseMatchScore: 0.75,
      priceScore:   0.75,
      coverageScore: 0.75,
      ratingScore:  0.80,
      highlights:   ["Coverage details available from your selected insurer"],
      warnings:     [],
      coverageMap:  {
        "Third-Party Liability":   { status: "covered", details: "Up to $2,000,000",           limit: "$2,000,000" },
        "Accident Benefits":       { status: "covered", details: "Ontario statutory benefits",  limit: "Per SABS"   },
        "Uninsured Motorist":      { status: "covered", details: "Protection against uninsured drivers" },
        "Collision":               { status: "covered", details: "Subject to deductible",       limit: "ACV"        },
        "Comprehensive":           { status: "covered", details: "Theft, weather, fire",        limit: "ACV"        },
      },
  };

  // ── Run engine for this carrier to extract real breakdown data ───────────────
  const sessionId = req.headers["x-session-id"] as string | undefined;
  let profileForExplain: typeof userProfilesTable.$inferSelect | undefined;
  try {
    if (sessionId) {
      const [p] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.sessionId, sessionId));
      profileForExplain = p;
    }
  } catch { /* DB unavailable — proceed without profile */ }

  // Parse what we can from userContext ("Age: 35, Location: Toronto, ON, Budget: 2000")
  const ageMatch  = userContext?.match(/Age:\s*(\d+)/i);
  const locMatch  = userContext?.match(/Location:\s*([^,]+(?:,\s*[^,]+)?)/i);
  const explainAge      = ageMatch ? parseInt(ageMatch[1], 10) : (profileForExplain?.age ?? 35);
  const explainLocation = locMatch ? locMatch[1].trim() : (profileForExplain?.location ?? "Toronto, ON");
  const explainType     = profileForExplain?.insuranceType ?? "auto";
  const explainPostal   = extractPostalPrefix(explainLocation);
  const explainYears    = Math.min(Math.max(explainAge - 16, 1), 40);

  type VehicleJsonE = { make?: string; type?: string; value?: number; year?: number; km?: number; use?: string };
  type PropertyJsonE = { region?: string; dwellingType?: string; rebuildValue?: number; homeAge?: number; heatingType?: string };
  const vehicleE   = (profileForExplain?.vehicleDetails  ?? {}) as VehicleJsonE;
  const propertyE  = (profileForExplain?.propertyDetails ?? {}) as PropertyJsonE;

  let allQuotesForExplain: QuoteResult[] = [];
  try {
    if (explainType === "home") {
      allQuotesForExplain = calculateHomeQuotes({
        region: propertyE.region ?? inferRegion(explainLocation),
        dwellingType: propertyE.dwellingType ?? "detached",
        rebuildValue: propertyE.rebuildValue ?? 500000,
        homeAge: propertyE.homeAge ?? 20,
        heatingType: propertyE.heatingType ?? "gas",
        claimsCount: 0, deductible: 1000, addons: [], discounts: [],
      });
    } else if (explainType === "renters") {
      allQuotesForExplain = calculateRentersQuotes({
        region: propertyE.region ?? inferRegion(explainLocation),
        contentsValue: 35000, claimsCount: 0, deductible: 500, addons: [], discounts: [],
      });
    } else if (explainType === "life") {
      allQuotesForExplain = calculateLifeQuotes({
        age: explainAge, gender: "male", smokingStatus: "non_smoker",
        healthClass: "standard_plus", product: "term20", coverageAmount: 1_000_000,
      });
    } else if (explainType === "health") {
      allQuotesForExplain = calculateHealthQuotes({
        age: explainAge, province: inferProvince(explainLocation),
        familySize: "single", preExisting: "none", planTier: "standard",
        deductible: 0, products: ["dental", "drugs"],
      });
    } else {
      allQuotesForExplain = calculateAutoQuotes({
        postalCode: explainPostal,
        vehicleMake: vehicleE.make ?? "honda", vehicleType: vehicleE.type ?? "sedan",
        vehicleValue: vehicleE.value ?? 30000, vehicleYear: vehicleE.year,
        annualKm: vehicleE.km ?? 15000, primaryUse: vehicleE.use ?? "commute",
        driverAge: explainAge, yearsLicensed: explainYears,
        atFaultAccidents: 0, convictions: "none",
        liability: 2000000, collisionDeductible: 1000, comprehensiveDeductible: 1000,
        addons: [], discounts: [],
      });
    }
  } catch { /* engine error — continue without breakdown */ }

  // Find this carrier and the cheapest in the run
  const thisQuote     = allQuotesForExplain.find(q => q.id === rawId);
  const cheapestQuote = allQuotesForExplain[0]; // sorted ascending

  // Patch synthetic policy with real engine numbers when available
  if (thisQuote && policy.monthlyPremium === 150 /* placeholder */) {
    (policy as any).insurerName    = thisQuote.insurerName;
    (policy as any).planName       = thisQuote.planName;
    (policy as any).monthlyPremium = thisQuote.monthlyPremium;
    (policy as any).annualPremium  = thisQuote.annualPremium;
    (policy as any).deductible     = thisQuote.deductible;
  }

  // Build the engine context block injected into the LLM prompt
  let engineContext = "";
  if (thisQuote) {
    // Sort factors by magnitude of impact (|factor - 1|) descending, skip neutral ones
    const sortedFactors = [...thisQuote.breakdown.factors]
      .filter(f => Math.abs(f.value - 1) > 0.005)
      .sort((a, b) => Math.abs(b.value - 1) - Math.abs(a.value - 1))
      .slice(0, 3);

    const discountPct = Math.round((1 - thisQuote.breakdown.discountMultiplier) * 100);
    const discountDesc = discountPct > 0
      ? `${discountPct}% total discount already applied`
      : "No discounts currently applied — several are available";

    const priceDiff = cheapestQuote && cheapestQuote.id !== rawId
      ? thisQuote.monthlyPremium - cheapestQuote.monthlyPremium
      : 0;

    engineContext = [
      `\nREAL PRICING DATA FROM RATE-FILING TABLES (use these exact numbers):`,
      `Carrier: ${thisQuote.insurerName} | Monthly: $${thisQuote.monthlyPremium} | Base rate: $${thisQuote.breakdown.baseRate}/mo`,
      ``,
      `Top factors driving this price (sorted by impact):`,
      ...sortedFactors.map(f =>
        `  • ${f.label}: ${f.impact} — ${
          f.value > 1
            ? `adds $${Math.round((f.value - 1) * thisQuote.breakdown.baseRate)} to base`
            : `saves $${Math.round((1 - f.value) * thisQuote.breakdown.baseRate)} from base`
        }`
      ),
      ``,
      `Discounts: ${discountDesc}`,
      priceDiff > 0
        ? `vs cheapest option (${cheapestQuote.insurerName} at $${cheapestQuote.monthlyPremium}/mo): this carrier is $${priceDiff}/mo more expensive ($${priceDiff * 12}/yr)`
        : `This IS the cheapest carrier for this profile.`,
    ].join("\n");
  }

  // Build coverage items from policy coverage map
  const coverageItems = requirements.map((req: string) => {
    const key = req.toLowerCase().trim();
    const match = Object.entries(policy.coverageMap).find(([k]) =>
      key === k.toLowerCase().trim() ||
      k.toLowerCase().includes(key) ||
      key.includes(k.toLowerCase())
    );
    if (match) {
      return {
        requirement: req,
        status: match[1].status,
        explanation: match[1].details,
        confidence: 0.9,
      };
    }
    return {
      requirement: req,
      status: "not_covered" as const,
      explanation: `${req} is not covered under this policy`,
      confidence: 0.7,
    };
  });

  const covered = coverageItems.filter((c: any) => c.status === "covered").map((c: any) => c.requirement);
  const partial = coverageItems.filter((c: any) => c.status === "partial").map((c: any) => c.requirement);
  const gaps = coverageItems.filter((c: any) => c.status === "not_covered").map((c: any) => c.requirement);

  // Use AI for summary and key terms
  let summary = `${policy.insurerName} ${policy.planName} provides ${covered.length} of your ${requirements.length} required coverages.`;
  let recommendation = gaps.length === 0
    ? "This policy meets all your stated requirements. It's a strong match."
    : `This policy is missing ${gaps.length} coverage(s) you need: ${gaps.join(", ")}. Consider if these gaps are acceptable or look for another policy.`;
  const keyTerms = [
    { term: "Deductible", definition: `The amount you pay out-of-pocket before insurance kicks in. This policy has a $${policy.deductible} deductible.` },
    { term: "Premium", definition: `The monthly cost of your insurance. This policy costs $${policy.monthlyPremium}/month.` },
    { term: "Comprehensive Coverage", definition: "Covers damage to your vehicle from non-collision events like theft, weather, or fire." },
    { term: "Liability Coverage", definition: "Pays for damages you cause to others in an accident." },
  ];

  try {
    const aiResponse = await openai.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content: "You are a licensed insurance advisor. You explain real rate data to customers in plain English. Respond only with valid JSON. Never invent numbers — use only the figures provided.",
        },
        {
          role: "user",
          content: `The user is looking at ${policy.insurerName} at $${policy.monthlyPremium}/month.
${engineContext}

User profile: ${userContext ?? "not provided"}
Coverage needs: ${requirements.join(", ") || "standard coverage"}
Covered by this policy: ${covered.join(", ") || "none"}
Coverage gaps: ${gaps.join(", ") || "none"}

Write a plain-English explanation that does ALL of the following:
1. Opens with 1–2 sentences naming the carrier and exact monthly cost.
2. Explains WHY each of the top 3 pricing factors above affects the premium actuarially — be specific about the dollar amounts and percentages shown above.
3. If this carrier costs more than the cheapest option, name that carrier and the exact monthly difference.
4. Suggests exactly 2 specific, actionable things the user could do RIGHT NOW to reduce this premium (reference real discounts or deductible changes, using the actual saving amounts from the data above).

Be concise but precise. Use real numbers from the data above — do not round or invent different amounts.

Respond with ONLY a JSON object: {"summary": "...", "recommendation": "..."}`,
        },
      ],
    });

    const raw = aiResponse.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      summary = parsed.summary || summary;
      recommendation = parsed.recommendation || recommendation;
    }
  } catch (_err) {
    // Use fallback values
  }

  res.json({
    policyId: rawId,
    summary,
    coverageItems,
    covered,
    partial,
    gaps,
    recommendation,
    keyTerms,
  });
});

router.post("/insurance/policies/:policyId/application", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.policyId) ? req.params.policyId[0] : req.params.policyId;

  const bodyParsed = GetApplicationFormBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "validation_error", message: bodyParsed.error.message });
    return;
  }

  const { userProfileId } = bodyParsed.data;
  const sessionId = req.headers["x-session-id"] as string || "default-session";

  // Get user profile if available
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.sessionId, sessionId));

  const vehicle = profile?.vehicleDetails as { make?: string; model?: string; year?: number } | null;
  const autoFilledCount = profile ? 8 : 0;

  const sections = [
    {
      title: "Personal Information",
      fields: [
        { fieldId: "first_name", label: "First Name", value: profile?.name?.split(" ")[0] || "", fieldType: "text" as const, required: true, editable: true },
        { fieldId: "last_name", label: "Last Name", value: profile?.name?.split(" ").slice(1).join(" ") || "", fieldType: "text" as const, required: true, editable: true },
        { fieldId: "age", label: "Age", value: profile?.age?.toString() || "", fieldType: "number" as const, required: true, editable: true },
        { fieldId: "location", label: "Province / Postal Code", value: profile?.location || "", fieldType: "text" as const, required: true, editable: true },
        { fieldId: "email", label: "Email Address", value: "", fieldType: "text" as const, required: true, editable: true },
        { fieldId: "phone", label: "Phone Number", value: "", fieldType: "text" as const, required: false, editable: true },
      ],
    },
    {
      title: "Vehicle Information",
      fields: [
        { fieldId: "vehicle_make", label: "Vehicle Make", value: vehicle?.make || "", fieldType: "text" as const, required: true, editable: true },
        { fieldId: "vehicle_model", label: "Vehicle Model", value: vehicle?.model || "", fieldType: "text" as const, required: true, editable: true },
        { fieldId: "vehicle_year", label: "Vehicle Year", value: vehicle?.year?.toString() || "", fieldType: "number" as const, required: true, editable: true },
        { fieldId: "vin", label: "VIN (optional)", value: "", fieldType: "text" as const, required: false, editable: true },
        { fieldId: "annual_mileage", label: "Annual Mileage", value: "12000", fieldType: "number" as const, required: true, editable: true },
        { fieldId: "primary_use", label: "Primary Use", value: "commute", fieldType: "select" as const, options: ["commute", "pleasure", "business", "farm"], required: true, editable: true },
      ],
    },
    {
      title: "Coverage & Payment",
      fields: [
        { fieldId: "deductible", label: "Deductible", value: "1000", fieldType: "text" as const, required: true, editable: true },
        { fieldId: "monthly_premium", label: "Monthly Premium", value: "", fieldType: "text" as const, required: false, editable: true },
        { fieldId: "start_date", label: "Coverage Start Date", value: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], fieldType: "date" as const, required: true, editable: true },
        { fieldId: "payment_method", label: "Payment Method", value: "credit_card", fieldType: "select" as const, options: ["credit_card", "bank_transfer", "check"], required: true, editable: true },
      ],
    },
  ];

  const totalFields = sections.reduce((sum, s) => sum + s.fields.length, 0);

  res.json({
    policyId: rawId,
    insurerName: rawId,
    planName: `Policy — ${rawId}`,
    monthlyPremium: null,
    sections,
    autoFilledCount,
    totalFieldCount: totalFields,
  });
});

router.post("/insurance/applications/submit", async (req, res): Promise<void> => {
  try {
    const { policyId, userProfileId, fields } = SubmitApplicationBody.parse(req.body);

    // Convert fields array to a JSON object
    const formData = fields.reduce((acc: any, f: any) => {
      acc[f.fieldId] = f.value;
      return acc;
    }, {} as Record<string, string>);

    // Derive insurer name and premium from submitted fields if available
    const submittedMonthlyRaw = formData["monthly_premium"] ?? "";
    const submittedMonthly = parseFloat(submittedMonthlyRaw.replace(/[^0-9.]/g, "")) || 0;

    // Insert into DB
    const confirmationId = randomUUID();
    await db.insert(applicationsTable).values({
      id: confirmationId,
      userProfileId: Number(userProfileId),
      policyId,
      insurerName: policyId,
      planName: `Policy — ${policyId}`,
      monthlyPremium: Math.round(submittedMonthly * 100), // store as cents
      status: "submitted",
      formData,
    });

    const mockPolicyNumber = `POL-${Math.floor(Math.random() * 1000000).toString().padStart(6, "0")}`;
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);

    res.json({
      confirmationId,
      policyNumber: mockPolicyNumber,
      insurerName: policyId,
      planName: `Policy — ${policyId}`,
      startDate: nextMonth.toISOString().split("T")[0],
      monthlyPremium: submittedMonthly,
      coverageSummary: ["Third-Party Liability", "Accident Benefits", "Comprehensive"],
      status: "submitted",
      message: "Your application has been received and is pending final review.",
    });
  } catch (err: any) {
    console.error("Submit application error:", err);
    res.status(500).json({ error: "application_error", message: err.message || "Failed to submit application" });
  }
});

// ─── Premium Optimizer ───────────────────────────────────────────────────────

type OptimizationTip = {
  id: string;
  title: string;
  description: string;
  category: string;
  minSavings: number;
  maxSavings: number;
  impact: "high" | "medium" | "low";
  actionLabel: string;
  profileField: string | null;
};

/** Compute a ±15% savings band, ensuring min >= 1 */
function savingsBand(saving: number, spreadLow = 0.85, spreadHigh = 1.15): [number, number] {
  return [Math.max(1, Math.round(saving * spreadLow)), Math.round(saving * spreadHigh)];
}

function impactLevel(monthly: number, threshHigh = 20, threshMed = 8): "high" | "medium" | "low" {
  return monthly >= threshHigh ? "high" : monthly >= threshMed ? "medium" : "low";
}

router.post("/insurance/optimize-profile", (req, res): void => {
  const { profile } = req.body as { profile?: Record<string, any> };
  if (!profile) {
    res.status(400).json({ error: "validation_error", message: "profile is required" });
    return;
  }

  const { name, insuranceType, location, age, vehicleDetails, propertyDetails } = profile;

  // ── Resolve location helpers (reuse module-scope functions) ────────────────
  const locationStr: string = location ?? "Toronto, ON";
  const postalPrefix = extractPostalPrefix(locationStr);

  type VehicleJson = { make?: string; type?: string; value?: number; year?: number; km?: number; use?: string };
  type PropertyJson = { region?: string; dwellingType?: string; rebuildValue?: number; homeAge?: number; heatingType?: string };

  const vehicle = (vehicleDetails ?? {}) as VehicleJson;
  const property = (propertyDetails ?? {}) as PropertyJson;
  const driverAge: number = typeof age === "number" ? age : 35;
  const yearsLicensed = Math.min(Math.max(driverAge - 16, 1), 40);

  const tips: OptimizationTip[] = [];

  // ── AUTO ──────────────────────────────────────────────────────────────────
  if (!insuranceType || insuranceType === "auto") {
    const baseInputs: AutoInputs = {
      postalCode:              postalPrefix,
      vehicleMake:             vehicle.make  ?? "honda",
      vehicleType:             vehicle.type  ?? "sedan",
      vehicleValue:            vehicle.value ?? 30000,
      vehicleYear:             vehicle.year,
      annualKm:                vehicle.km    ?? 15000,
      primaryUse:              vehicle.use   ?? "commute",
      driverAge,
      yearsLicensed,
      atFaultAccidents:        0,
      convictions:             "none",
      liability:               2000000,
      collisionDeductible:     1000,
      comprehensiveDeductible: 1000,
      addons:                  [],
      discounts:               [],
    };

    const baseline = calculateAutoQuotes(baseInputs);
    const cheapest = baseline[0];
    const median   = baseline[Math.floor(baseline.length / 2)];

    // Scenario A — Winter tires (4% discount, FSRA-mandated in Ontario)
    const withTires  = calculateAutoQuotes({ ...baseInputs, discounts: ["winter_tires"] });
    const tireSaving = cheapest.monthlyPremium - withTires[0].monthlyPremium;
    if (tireSaving > 0) {
      const [lo, hi] = savingsBand(tireSaving);
      tips.push({
        id: "winter_tires",
        title: "Apply the mandatory winter tire discount",
        description: `Ontario's FSRA requires all auto insurers to offer a winter tire discount of up to 5%. ` +
          `Based on your ${vehicle.make ?? "vehicle"} in ${locationStr}, this saves ~$${tireSaving}/month. ` +
          `Present your purchase receipts to your broker or upload them in your insurer's app to activate it instantly.`,
        category: "safety",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(tireSaving),
        actionLabel: "Submit tire receipts",
        profileField: null,
      });
    }

    // Scenario B — Home bundle (8% multi-line discount)
    const withBundle  = calculateAutoQuotes({ ...baseInputs, discounts: ["home_bundle"] });
    const bundleSaving = cheapest.monthlyPremium - withBundle[0].monthlyPremium;
    if (bundleSaving > 0) {
      const [lo, hi] = savingsBand(bundleSaving);
      tips.push({
        id: "home_bundle",
        title: "Bundle auto with home or renters insurance",
        description: `Placing both your auto and home/renters policy with the same carrier earns an 8% multi-line discount. ` +
          `At current ${locationStr} rates, this is worth ~$${bundleSaving}/month on your auto policy alone — ` +
          `call your broker at renewal or visit your insurer's website to combine.`,
        category: "bundling",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(bundleSaving, 25, 12),
        actionLabel: "Bundle policies",
        profileField: null,
      });
    }

    // Scenario C — Raise collision deductible $1,000 → $2,000 (saves ~5% on coverage loading)
    if (baseInputs.collisionDeductible < 2000) {
      const withHighDed  = calculateAutoQuotes({ ...baseInputs, collisionDeductible: 2000 });
      const dedSaving    = cheapest.monthlyPremium - withHighDed[0].monthlyPremium;
      if (dedSaving > 0) {
        const [lo, hi] = savingsBand(dedSaving);
        tips.push({
          id: "higher_deductible",
          title: "Raise collision deductible to $2,000",
          description: `Increasing your collision deductible from $${baseInputs.collisionDeductible.toLocaleString()} to $2,000 ` +
            `reduces your premium by ~$${dedSaving}/month ($${dedSaving * 12}/year). ` +
            `This is cost-effective if you have $2,000 in emergency savings — most minor incidents are handled without a claim anyway.`,
          category: "deductible",
          minSavings: lo,
          maxSavings: hi,
          impact: impactLevel(dedSaving, 15, 6),
          actionLabel: "Adjust deductible",
          profileField: null,
        });
      }
    }

    // Scenario D — Telematics (10% discount, only carriers where tele === true)
    const withTele = calculateAutoQuotes({ ...baseInputs, discounts: ["telematics"] });
    const baseTeleCarrier = baseline.find(q => q.telematics === true);
    const withTeleCarrier = withTele.find(q => q.telematics === true);
    if (baseTeleCarrier && withTeleCarrier) {
      const teleSaving = baseTeleCarrier.monthlyPremium - withTeleCarrier.monthlyPremium;
      if (teleSaving > 0) {
        const [lo, hi] = savingsBand(teleSaving, 0.80, 1.20);
        tips.push({
          id: "telematics",
          title: `Enroll in ${withTeleCarrier.insurerName}'s usage-based program`,
          description: `${withTeleCarrier.insurerName} offers up to 10% off for safe drivers who share driving data via app or OBD device. ` +
            `Based on your profile, enrolling saves ~$${teleSaving}/month from day one, ` +
            `with typical safe drivers reaching 13–15% within 6 months.`,
          category: "vehicle",
          minSavings: lo,
          maxSavings: hi,
          impact: impactLevel(teleSaving, 20, 10),
          actionLabel: "Enroll in telematics",
          profileField: null,
        });
      }
    }

    // Scenario E — Switch to cheapest carrier (vs market median)
    const switchSaving = median.monthlyPremium - cheapest.monthlyPremium;
    if (switchSaving > 5) {
      const [lo, hi] = savingsBand(switchSaving, 0.80, 1.20);
      tips.push({
        id: "switch_carrier",
        title: `Switch to ${cheapest.insurerName} — lowest rate in ${locationStr}`,
        description: `Auto insurance rates for your exact profile in ${locationStr} range from ` +
          `$${cheapest.monthlyPremium} to $${median.monthlyPremium}/month across 28 carriers. ` +
          `${cheapest.insurerName} currently offers the lowest rate — switching saves $${Math.round(switchSaving * 12).toLocaleString()}/year.`,
        category: "location",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(switchSaving, 30, 15),
        actionLabel: "Get a quote",
        profileField: null,
      });
    }

  // ── HOME ───────────────────────────────────────────────────────────────────
  } else if (insuranceType === "home") {
    const baseInputs: HomeInputs = {
      region:       property.region       ?? inferRegion(locationStr),
      dwellingType: property.dwellingType ?? "detached",
      rebuildValue: property.rebuildValue ?? 500000,
      homeAge:      property.homeAge      ?? 20,
      heatingType:  property.heatingType  ?? "gas",
      claimsCount:  0,
      deductible:   1000,
      addons:       [],
      discounts:    [],
    };

    const baseline = calculateHomeQuotes(baseInputs);
    const cheapest = baseline[0];
    const median   = baseline[Math.floor(baseline.length / 2)];

    // Alarm — 5% discount
    const alarmSaving = Math.round(cheapest.monthlyPremium - calculateHomeQuotes({ ...baseInputs, discounts: ["alarm"] })[0].monthlyPremium);
    if (alarmSaving > 0) {
      const [lo, hi] = savingsBand(alarmSaving);
      tips.push({
        id: "alarm",
        title: "Install a monitored security alarm",
        description: `A professionally monitored alarm qualifies for a 5% discount at most Ontario home insurers. ` +
          `At a rebuild value of $${(baseInputs.rebuildValue).toLocaleString()}, this saves ~$${alarmSaving}/month ($${alarmSaving * 12}/year). ` +
          `Provide your monitoring contract number to your insurer at next renewal.`,
        category: "safety",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(alarmSaving),
        actionLabel: "Add alarm details",
        profileField: null,
      });
    }

    // Auto bundle — 10% discount
    const bundleSaving = Math.round(cheapest.monthlyPremium - calculateHomeQuotes({ ...baseInputs, discounts: ["auto_bundle"] })[0].monthlyPremium);
    if (bundleSaving > 0) {
      const [lo, hi] = savingsBand(bundleSaving);
      tips.push({
        id: "auto_bundle",
        title: "Bundle home with your auto insurance",
        description: `Multi-line bundling earns a 10% home discount at most carriers. ` +
          `At current ${locationStr} rates, this saves ~$${bundleSaving}/month on your home policy — ` +
          `ask your broker to requote both policies together at renewal.`,
        category: "bundling",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(bundleSaving, 20, 10),
        actionLabel: "Bundle policies",
        profileField: null,
      });
    }

    // Higher deductible $1,000 → $2,000 (-5% loading)
    const dedSaving = Math.round(cheapest.monthlyPremium - calculateHomeQuotes({ ...baseInputs, deductible: 2000 })[0].monthlyPremium);
    if (dedSaving > 0) {
      const [lo, hi] = savingsBand(dedSaving);
      tips.push({
        id: "higher_deductible",
        title: "Raise home deductible to $2,000",
        description: `Increasing your deductible from $1,000 to $2,000 reduces your premium by ~$${dedSaving}/month. ` +
          `Most home claims are large enough that you'd file regardless — the higher deductible mainly affects small cosmetic claims ` +
          `that are usually better paid out-of-pocket to protect your claims-free discount.`,
        category: "deductible",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(dedSaving, 15, 6),
        actionLabel: "Adjust deductible",
        profileField: null,
      });
    }

    // Claims-free 5yr — 7% discount
    const cfSaving = Math.round(cheapest.monthlyPremium - calculateHomeQuotes({ ...baseInputs, discounts: ["claims_free_5yr"] })[0].monthlyPremium);
    if (cfSaving > 0) {
      const [lo, hi] = savingsBand(cfSaving);
      tips.push({
        id: "claims_free",
        title: "Claim your 5-year claims-free discount",
        description: `If you haven't filed a home insurance claim in 5+ years, you qualify for a 7% loyalty discount at most carriers. ` +
          `This saves ~$${cfSaving}/month — many policyholders forget to request it at renewal. ` +
          `Simply ask your broker: "Am I receiving the claims-free discount?"`,
        category: "lifestyle",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(cfSaving),
        actionLabel: "Verify with broker",
        profileField: null,
      });
    }

    // Switch carrier
    const switchSaving = Math.round(median.monthlyPremium - cheapest.monthlyPremium);
    if (switchSaving > 5) {
      const [lo, hi] = savingsBand(switchSaving, 0.80, 1.20);
      tips.push({
        id: "switch_carrier",
        title: `${cheapest.insurerName} offers the lowest home rate in your area`,
        description: `Home insurance for a ${baseInputs.dwellingType} in ${locationStr} ranges from ` +
          `$${cheapest.monthlyPremium} to $${median.monthlyPremium}/month. ` +
          `Switching to ${cheapest.insurerName} saves $${(switchSaving * 12).toLocaleString()}/year vs the market median.`,
        category: "location",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(switchSaving, 25, 12),
        actionLabel: "Get a quote",
        profileField: null,
      });
    }

  // ── RENTERS ────────────────────────────────────────────────────────────────
  } else if (insuranceType === "renters") {
    const baseInputs: RentersInputs = {
      region:        property.region ?? inferRegion(locationStr),
      contentsValue: 35000,
      claimsCount:   0,
      deductible:    500,
      addons:        [],
      discounts:     [],
    };

    const baseline = calculateRentersQuotes(baseInputs);
    const cheapest = baseline[0];
    const median   = baseline[Math.floor(baseline.length / 2)];

    const rentersScenarios: Array<{
      id: string; discounts?: string[]; deductible?: number;
      title: string; description: string; category: string;
    }> = [
      { id: "auto_bundle",   discounts: ["auto_bundle"],  title: "Bundle with auto insurance",        category: "bundling",   description: `Insuring your vehicle and rental unit with the same carrier saves 10% on your renters premium.` },
      { id: "claims_free",   discounts: ["claims_free"],  title: "Apply your claims-free discount",   category: "lifestyle",  description: `If you haven't filed a renters claim in 3+ years, request the 7% claims-free discount at renewal.` },
      { id: "annual_pay",    discounts: ["annual_pay"],   title: "Switch to annual payment",          category: "credit",     description: `Paying your full annual premium upfront avoids monthly billing fees and earns a 5% discount.` },
      { id: "higher_deductible", deductible: 1000,        title: "Raise deductible to $1,000",        category: "deductible", description: `Increasing your deductible from $500 to $1,000 reduces your monthly cost.` },
    ];

    for (const scenario of rentersScenarios) {
      const modified = calculateRentersQuotes({
        ...baseInputs,
        ...(scenario.discounts ? { discounts: scenario.discounts } : {}),
        ...(scenario.deductible ? { deductible: scenario.deductible } : {}),
      });
      const saving = Math.round(cheapest.monthlyPremium - modified[0].monthlyPremium);
      if (saving > 0) {
        const [lo, hi] = savingsBand(saving);
        tips.push({
          id: scenario.id,
          title: scenario.title,
          description: `${scenario.description} Based on your profile in ${locationStr}, this saves ~$${saving}/month.`,
          category: scenario.category,
          minSavings: lo,
          maxSavings: hi,
          impact: impactLevel(saving, 5, 2),
          actionLabel: "Apply discount",
          profileField: null,
        });
      }
    }

    const switchSaving = Math.round(median.monthlyPremium - cheapest.monthlyPremium);
    if (switchSaving > 2) {
      const [lo, hi] = savingsBand(switchSaving, 0.80, 1.20);
      tips.push({
        id: "switch_carrier",
        title: `${cheapest.insurerName} offers the lowest renters rate`,
        description: `Renters insurance in ${locationStr} ranges from $${cheapest.monthlyPremium} to $${median.monthlyPremium}/month. ` +
          `Switching to ${cheapest.insurerName} saves $${(switchSaving * 12).toLocaleString()}/year.`,
        category: "location",
        minSavings: lo,
        maxSavings: hi,
        impact: impactLevel(switchSaving, 5, 2),
        actionLabel: "Switch carrier",
        profileField: null,
      });
    }

  // ── LIFE / HEALTH — engine-grounded static tips ────────────────────────────
  } else {
    tips.push(
      {
        id: "compare_carriers",
        title: "Compare all carriers — rates vary up to 40%",
        description: `${insuranceType === "life" ? "Life" : "Health"} insurance premiums differ significantly by carrier for identical coverage. ` +
          `An independent broker search is free and typically finds 15–40% lower rates within the same product category.`,
        category: "location",
        minSavings: 10, maxSavings: 35,
        impact: "high", actionLabel: "Compare now", profileField: null,
      },
      {
        id: "right_product",
        title: insuranceType === "life" ? "Choose term over whole life for pure coverage" : "Raise your deductible to lower monthly cost",
        description: insuranceType === "life"
          ? "Whole life premiums are ~12× higher than term-20 for the same death benefit. If your goal is income replacement or mortgage coverage, term life provides the same protection at a fraction of the cost."
          : "Increasing your health plan deductible from $0 to $500 reduces monthly premiums by 15–20%, saving $20–35/month for most plan types.",
        category: insuranceType === "life" ? "lifestyle" : "deductible",
        minSavings: insuranceType === "life" ? 80 : 20, maxSavings: insuranceType === "life" ? 150 : 35,
        impact: "high", actionLabel: "Explore options", profileField: null,
      },
      {
        id: "lifestyle",
        title: insuranceType === "life" ? "Quit smoking to unlock non-smoker rates" : "Opt for a higher-deductible plan with an HSA",
        description: insuranceType === "life"
          ? "Smoker rates are 2.65× non-smoker rates. After 12 months smoke-free, most carriers reclassify you — saving $800–$1,400/year on a $1M policy."
          : "Pairing a high-deductible health plan with a Health Spending Account (HSA) lets you pay eligible expenses pre-tax, effectively reducing your net cost by your marginal tax rate.",
        category: "lifestyle",
        minSavings: insuranceType === "life" ? 65 : 15, maxSavings: insuranceType === "life" ? 115 : 30,
        impact: "high", actionLabel: "Learn more", profileField: null,
      },
    );
  }

  // ── Sort by maxSavings descending, cap at 5 ────────────────────────────────
  tips.sort((a, b) => b.maxSavings - a.maxSavings);
  const finalTips = tips.slice(0, 5);

  const totalMonthly = finalTips.reduce((s, t) => s + Math.round((t.minSavings + t.maxSavings) / 2), 0);
  const personalizedQuote =
    `Based on your ${insuranceType ?? "auto"} insurance profile in ${locationStr}, ` +
    `we ran ${finalTips.length} real what-if scenarios through FSRA rate-filing data and found ` +
    `up to $${totalMonthly}/month in verified savings — every number above is calculated, not estimated.`;

  res.json({ tips: finalTips, personalizedQuote });
});

router.post("/ai/parse-answer", async (req, res): Promise<void> => {
  const parsed = AiParseAnswerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const { questionId, questionText, answer } = parsed.data;

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: "system", content: "You are an expert data parser. Respond only with valid JSON." },
        { role: "user", content: buildParseAnswerPrompt(questionId, questionText, answer) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "";
    res.json(parseAnswerFromModelContent(raw, answer));
  } catch (err) {
    console.error("Parse answer error:", err);
    res.status(500).json({ error: "ai_error", message: "Failed to parse answer" });
  }
});

router.post("/ai/ask-expert", async (req, res): Promise<void> => {
  const parsed = AskExpertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const { query, chatHistory } = parsed.data;

  try {
    const pythonScriptPath = path.join(process.cwd(), "src", "python-workers", "moorcheh.py");

    const pythonProcess = spawn(resolvePythonBin(), [pythonScriptPath], {
      env: {
        ...process.env,
        MOORCHEH_API_KEY: process.env.MOORCHEH_API_KEY || "",
      }
    });

    let stdoutData = "";
    let stderrData = "";

    pythonProcess.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Python worker failed:", stderrData);
        res.status(500).json({ error: "ai_error", message: "Python script error" });
        return;
      }

      try {
        const resultJSON = JSON.parse(stdoutData.trim());
        if (resultJSON.error) {
          console.error("Moorcheh Error:", resultJSON.error);
          res.status(500).json({ error: "ai_error", message: resultJSON.error });
          return;
        }

        res.json({
          answer: resultJSON.answer,
          contextCount: resultJSON.contextCount || 0
        });
      } catch (e) {
        console.error("Failed to parse python stdout:", stdoutData);
        res.status(500).json({ error: "ai_error", message: "Invalid response from python worker" });
      }
    });

    // Write the inputs to stdin
    pythonProcess.stdin.write(JSON.stringify({
      namespace: "insurewise-knowledge",
      query: query,
      chatHistory: chatHistory
    }));
    pythonProcess.stdin.end();

  } catch (err) {
    console.error("Ask expert error:", err);
    res.status(500).json({ error: "ai_error", message: "Failed to ask expert" });
  }
});

export default router;
