"use client";

import { motion } from "framer-motion";
import {
  Zap, Play, Sparkles, Captions, Share2, Focus, Check, Star,
  Menu, X, ArrowRight, TrendingUp,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const router = useRouter();

  const startFree = () => {
    router.push("/signup");
  };

  const contactSales = () => {
    window.location.href = "mailto:soporte@viralclips.ai?subject=ViralClips%20Agency%20plan";
  };

  const upgradeToPro = async () => {
    setCheckoutLoading(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push("/signup");
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el pago");
      if (!data.url) throw new Error("Stripe no devolvio una URL de pago");

      window.location.href = data.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      alert(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-purple-500/30 font-sans">

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400">
                ViralClips AI
              </span>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="#features" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Features</Link>
              <Link href="#pricing" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Pricing</Link>
              <Link href="#showcase" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Showcase</Link>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Login</Link>
              <Link href="/dashboard" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-all hover:shadow-lg hover:shadow-purple-500/25">
                Get Started
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button className="md:hidden text-slate-300" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="md:hidden bg-slate-900 border-b border-white/5 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-3">
              <Link href="#features" className="block text-sm font-medium text-slate-300 py-2">Features</Link>
              <Link href="#pricing" className="block text-sm font-medium text-slate-300 py-2">Pricing</Link>
              <Link href="#showcase" className="block text-sm font-medium text-slate-300 py-2">Showcase</Link>
              <div className="pt-3 border-t border-white/5 flex flex-col gap-3">
                <Link href="/login" className="text-sm font-medium text-slate-300 py-2">Login</Link>
                <Link href="/dashboard" className="w-full px-4 py-3 bg-purple-600 text-white text-sm font-medium rounded-lg text-center">Get Started</Link>
              </div>
            </div>
          </motion.div>
        )}
      </nav>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 lg:py-32">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-slate-950 to-slate-950 pointer-events-none" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-medium mb-6"
            >
              <Sparkles className="w-3 h-3" />
              <span>New: AI Viral Score Detection</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight"
            >
              Transform 1 long video into{" "}
              <br className="hidden md:block" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400">
                10 viral clips
              </span>{" "}
              in 2 minutes
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10"
            >
              AI-powered video clipping for TikTok, Reels, and Shorts. Upload your content and let our neural engine find the high-retention moments for you.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
            >
              <Link
                href="/dashboard"
                className="group relative px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/25 overflow-hidden w-full sm:w-auto"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <Zap className="w-5 h-5" />
                  Generate Clips Now
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
              <Link
                href="#features"
                className="px-8 py-4 border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Play className="w-5 h-5" />
                See How It Works
              </Link>
            </motion.div>

            {/* ── Hero Mockup ── */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="relative mx-auto max-w-5xl rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl p-2 shadow-2xl shadow-purple-500/10"
            >
              <div className="rounded-xl overflow-hidden border border-white/5 bg-slate-900">
                {/* Browser chrome */}
                <div className="h-9 border-b border-white/5 bg-slate-900/80 flex items-center px-4 gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/40 border border-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40 border border-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/40 border border-green-500/60" />
                  <div className="ml-3 flex-1 max-w-xs h-5 bg-slate-800 rounded border border-white/5 flex items-center px-3">
                    <span className="text-[10px] text-slate-500">viralclips.ai/dashboard</span>
                  </div>
                </div>

                {/* App body */}
                <div className="flex h-64 md:h-80">

                  {/* ── Video panel ── */}
                  <div className="flex-1 relative overflow-hidden bg-slate-950 border-r border-white/5">

                    {/* Simulated video — gradient scene suggesting podcast/interview */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 via-slate-900 to-purple-900/40" />

                    {/* Simulated speaker silhouette */}
                    <div className="absolute inset-0 flex items-end justify-center pb-10 pointer-events-none">
                      <div className="relative">
                        {/* Head */}
                        <div className="w-12 h-12 rounded-full bg-gradient-to-b from-slate-600 to-slate-700 mx-auto mb-0.5 shadow-lg" />
                        {/* Shoulders */}
                        <div className="w-28 h-16 rounded-t-full bg-gradient-to-b from-slate-700 to-slate-800 shadow-lg" />
                        {/* AI face-tracking box */}
                        <motion.div
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute -top-1 left-1/2 -translate-x-1/2 w-14 h-14 border border-purple-400/60 rounded"
                          style={{ top: '-2px' }}
                        >
                          <span className="absolute -top-4 left-0 text-[8px] text-purple-400/80 font-mono whitespace-nowrap">FACE LOCK</span>
                          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-purple-400" />
                          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-purple-400" />
                          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-purple-400" />
                          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-purple-400" />
                        </motion.div>
                      </div>
                    </div>

                    {/* Animated AI scan line */}
                    <motion.div
                      animate={{ x: ["-5%", "105%"] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
                      className="absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-purple-400/80 to-transparent pointer-events-none"
                    />

                    {/* AI badge top-left */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] font-medium text-white bg-slate-900/80 backdrop-blur border border-purple-500/30 px-2 py-1 rounded-full">
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className="w-1.5 h-1.5 bg-green-400 rounded-full"
                      />
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      AI ANALYZING
                    </div>

                    {/* Timestamp top-right */}
                    <div className="absolute top-3 right-3 text-[10px] text-slate-500 font-mono bg-slate-900/60 px-2 py-0.5 rounded">
                      08:24 / 24:00
                    </div>

                    {/* Timeline bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-slate-900/90 backdrop-blur px-3 flex flex-col justify-center gap-1">
                      <div className="relative w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        {/* Progress */}
                        <div className="absolute left-0 top-0 h-full w-[35%] bg-slate-500 rounded-full" />
                        {/* Detected viral segments */}
                        <div className="absolute top-0 h-full w-[12%] bg-green-400/80 rounded-full" style={{ left: "8%" }} />
                        <div className="absolute top-0 h-full w-[14%] bg-purple-400/80 rounded-full" style={{ left: "38%" }} />
                        <div className="absolute top-0 h-full w-[10%] bg-blue-400/80 rounded-full" style={{ left: "68%" }} />
                        {/* Playhead */}
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg" style={{ left: "35%" }} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[9px] text-slate-500">0:00</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] text-green-400">●  Clip 1</span>
                          <span className="text-[9px] text-purple-400">●  Clip 2</span>
                          <span className="text-[9px] text-blue-400">●  Clip 3</span>
                        </div>
                        <span className="text-[9px] text-slate-500">24:00</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Clips panel ── */}
                  <div className="w-48 md:w-56 flex flex-col bg-slate-900/60 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/5">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Viral Clips</span>
                    </div>
                    <div className="flex-1 overflow-auto p-2 space-y-2">
                      {[
                        { label: "The Secret Sauce", score: 98, color: "text-green-400", bar: "bg-green-400", idx: "1", w: "w-[98%]" },
                        { label: "Expert Insight", score: 82, color: "text-purple-400", bar: "bg-purple-400", idx: "2", w: "w-[82%]" },
                        { label: "Funny Moment", score: 75, color: "text-blue-400", bar: "bg-blue-400", idx: "3", w: "w-[75%]" },
                      ].map((clip) => (
                        <div key={clip.idx} className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:border-purple-500/30 transition-colors group cursor-pointer">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-semibold text-white truncate">{clip.label}</span>
                            <span className={`text-[10px] font-bold ml-1 flex-shrink-0 ${clip.color}`}>{clip.score}%</span>
                          </div>
                          <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full ${clip.w} ${clip.bar} rounded-full opacity-80`} />
                          </div>
                          <div className="flex items-center gap-1 mt-1.5">
                            <TrendingUp className={`w-2.5 h-2.5 ${clip.color}`} />
                            <span className="text-[9px] text-slate-500">Viral Score</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-2 border-t border-white/5">
                      <button className="w-full py-1.5 text-[10px] font-semibold bg-purple-600/80 hover:bg-purple-500/80 text-white rounded-lg transition-colors flex items-center justify-center gap-1">
                        <Zap className="w-3 h-3" />
                        Export All Clips
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 lg:py-32 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Unfair advantages for content creators</h2>
              <p className="text-slate-400 max-w-2xl mx-auto">
                Our AI handles the manual labor, so you can focus on being the creative visionary.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureCard
                icon={<Sparkles className="w-6 h-6 text-purple-400" />}
                title="AI Magic Detection"
                description="Our neural engine analyzes video sentiment, audience retention patterns, and punchlines to identify the exact moments that will go viral."
              />
              <FeatureCard
                icon={<Captions className="w-6 h-6 text-blue-400" />}
                title="Auto-Captions"
                description="90% of mobile users watch without sound. Our AI generates stylish, animated captions in 50+ languages automatically."
              />
              <FeatureCard
                icon={<Share2 className="w-6 h-6 text-pink-400" />}
                title="Multi-Platform Export"
                description="One-click export for TikTok, Instagram Reels, and YouTube Shorts with correct aspect ratios and no watermarks."
              />
              <FeatureCard
                icon={<Focus className="w-6 h-6 text-indigo-400" />}
                title="Smart Reframing"
                description="AI face-tracking ensures the speaker is always in the center of the vertical frame, no matter how they move."
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-20 lg:py-32 bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
              <p className="text-slate-400">Choose the plan that fits your content volume.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <PricingCard
                name="Free"
                price="$0"
                period="/mo"
                description="For new creators starting their viral journey."
                features={["3 videos per month", "Viral score detection", "No watermark"]}
                cta="Start Free"
                popular={false}
                onClick={startFree}
              />
              <PricingCard
                name="Pro"
                price="$14.99"
                period="/mo"
                description="For consistent creators scaling their presence."
                features={["30 videos per month", "Unlimited viral clips", "No watermarks", "Priority rendering"]}
                cta="Upgrade to Pro"
                popular={true}
                loading={checkoutLoading}
                onClick={upgradeToPro}
              />
              <PricingCard
                name="Agency"
                price="$49"
                period="/mo"
                description="For teams and high-volume content studios."
                features={["Unlimited videos", "5 team members", "Custom brand templates", "API access"]}
                cta="Contact Sales"
                popular={false}
                onClick={contactSales}
              />
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="showcase" className="py-20 lg:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Built by creators, for creators.</h2>
                <p className="text-slate-400 mb-6">
                  ViralClips AI has helped thousands of creators grow their following by over 300% in their first 30 days.
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-900" />
                    <div className="w-10 h-10 rounded-full bg-slate-600 border-2 border-slate-900" />
                    <div className="w-10 h-10 rounded-full bg-purple-500 border-2 border-slate-900 flex items-center justify-center text-xs font-bold text-white">10k+</div>
                  </div>
                  <span className="text-sm text-slate-300">Join 10,000+ creators</span>
                </div>
              </div>
              <div className="space-y-4">
                <TestimonialCard
                  quote="I used to spend 5 hours editing one podcast into clips. Now it takes me 5 minutes. The AI detection is scary accurate."
                  author="Alex Rivera"
                  role="Podcast Host"
                  stars={5}
                />
                <TestimonialCard
                  quote="The captions alone are worth the price. They're way more stylish than anything I could make in Premiere."
                  author="Sarah Chen"
                  role="UGC Creator"
                  stars={5}
                />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 lg:py-32">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="p-8 md:p-12 rounded-3xl border border-white/10 bg-gradient-to-b from-purple-500/10 to-blue-500/5 backdrop-blur-sm"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to go viral?</h2>
              <p className="text-slate-400 mb-8 max-w-lg mx-auto">
                Join 10,000+ creators who are using ViralClips AI to dominate social media.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/25"
              >
                Start Your Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <p className="text-xs text-slate-500 mt-4">No credit card required &bull; Cancel anytime</p>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-12 bg-slate-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <span className="text-lg font-bold text-white">ViralClips AI</span>
              </div>
              <div className="flex items-center gap-6 text-sm text-slate-400">
                <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
                <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
                <Link href="#" className="hover:text-white transition-colors">API Docs</Link>
                <Link href="#" className="hover:text-white transition-colors">Affiliate</Link>
              </div>
              <div className="text-sm text-slate-500">
                &copy; 2024 ViralClips AI. Built for the future of content.
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors"
    >
      <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </motion.div>
  );
}

function PricingCard({ name, price, period, description, features, cta, popular, loading, onClick }: {
  name: string; price: string; period: string; description: string;
  features: string[]; cta: string; popular: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <div className={`relative p-8 rounded-2xl border ${popular ? "border-purple-500/50 bg-purple-500/5" : "border-white/5 bg-white/5"} backdrop-blur-sm flex flex-col`}>
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-purple-600 text-white text-xs font-semibold rounded-full">
          MOST POPULAR
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">{name}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold">{price}</span>
          <span className="text-slate-400">{period}</span>
        </div>
        <p className="text-sm text-slate-400 mt-2">{description}</p>
      </div>
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-slate-300">
            <Check className="w-4 h-4 text-purple-400 shrink-0" />
            {feature}
          </li>
        ))}
      </ul>
      <button
        onClick={onClick}
        disabled={loading}
        className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${popular ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-white/10 hover:bg-white/15 text-white"}`}
      >
        {loading ? "Redirecting..." : cta}
      </button>
    </div>
  );
}

function TestimonialCard({ quote, author, role, stars }: { quote: string; author: string; role: string; stars: number }) {
  return (
    <div className="p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm">
      <div className="flex gap-1 mb-4">
        {Array.from({ length: stars }).map((_, i) => (
          <Star key={i} className="w-4 h-4 fill-purple-400 text-purple-400" />
        ))}
      </div>
      <p className="text-sm text-slate-300 mb-4 leading-relaxed">&ldquo;{quote}&rdquo;</p>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-700" />
        <div>
          <div className="text-sm font-medium text-white">{author}</div>
          <div className="text-xs text-slate-500">{role}</div>
        </div>
      </div>
    </div>
  );
}
