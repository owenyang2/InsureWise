import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Shield, Zap, BrainCircuit } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { useStore } from "@/store/use-store";

export default function Home() {
  const colorTheme = useStore((state) => state.colorTheme);
  const isTerminal = colorTheme === "terminal";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 overflow-hidden">
          {/* Background Image & Overlay */}
          <div className="absolute inset-0 z-0">
            <img
              src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
              alt="Background"
              className={`w-full h-full object-cover ${isTerminal ? "opacity-10" : "opacity-40"}`}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background to-background" />
          </div>

          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-6 border border-primary/20">
                  <BrainCircuit className="w-4 h-4" />
                  AI-Powered Insurance Matching
                </span>

                <h1 className="text-5xl md:text-7xl font-display font-bold leading-[1.1] mb-6">
                  {isTerminal ? (
                    <>
                      <span className="text-primary">$</span>{" "}
                      <span className="text-foreground">find the perfect policy,</span>{" "}
                      <br />
                      <span className="text-primary">without the headache_</span>
                    </>
                  ) : (
                    <>
                      <span className="text-foreground">Find the perfect policy,</span>
                      <br />
                      <span className="text-primary">without the headache.</span>
                    </>
                  )}
                </h1>

                <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                  Our AI agent analyzes your specific needs, reads the fine print, and compares 40+ carriers to find your optimal coverage. No jargon, just clear recommendations.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href="/onboard"
                    className={`w-full sm:w-auto px-8 py-4 bg-primary text-primary-foreground font-semibold text-lg flex items-center justify-center gap-2 shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-1 transition-all duration-300 ${isTerminal ? "rounded-lg" : "rounded-xl"}`}
                  >
                    {isTerminal ? "./start-consultation" : "Start AI Consultation"}
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                  <Link
                    href="/compare"
                    className={`w-full sm:w-auto px-8 py-4 font-semibold text-lg flex items-center justify-center gap-2 border border-border hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 shadow-sm ${isTerminal ? "rounded-lg bg-card text-foreground" : "rounded-xl bg-white text-foreground"}`}
                  >
                    {isTerminal ? "ls policies/" : "Browse Policies"}
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Value Props */}
        <section className={`py-24 ${isTerminal ? "bg-card" : "bg-white"}`}>
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
              {[
                {
                  icon: Shield,
                  title: "Unbiased Recommendations",
                  desc: "We don't play favorites. Our AI ranks policies purely on how well they match your priorities and budget."
                },
                {
                  icon: Zap,
                  title: "Instant Gap Analysis",
                  desc: "Our AI analyzes policies to highlight exactly what's covered and what's not."
                },
                {
                  icon: CheckCircle2,
                  title: "One-Click Apply",
                  desc: "Once you choose a policy, we auto-fill your application using the context from your chat."
                }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className={`bg-background p-8 border border-border shadow-lg hover:shadow-xl transition-all duration-300 ${isTerminal ? "rounded-2xl shadow-black/20 hover:border-primary/30" : "rounded-3xl shadow-blue-900/5"}`}
                >
                  <div className={`w-14 h-14 bg-primary/10 flex items-center justify-center mb-6 ${isTerminal ? "rounded-xl" : "rounded-2xl"}`}>
                    <feature.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
