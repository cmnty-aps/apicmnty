import React from "react";
import { BadgeCheck, Library } from "lucide-react";

interface LandingHeroProps {
  onGetStarted: () => void;
  onViewVitals: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onGetStarted, onViewVitals }) => {
  return (
    <section className="pt-16 pb-6 flex flex-col items-center text-center space-y-6 max-w-2xl mx-auto">
      
      {/* Badge indicator: #1 Affordable API Service */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/40 border border-zinc-700/50 text-[12px] text-zinc-400 font-sans tracking-tight">
        <div className="flex items-center justify-center">
          <BadgeCheck className="h-4 w-4 text-zinc-500 fill-zinc-500/10" />
        </div>
        <span className="font-medium">#1 Affordable API Service</span>
      </div>

      {/* Main big block heading */}
      <h2 className="text-[38px] sm:text-[56px] font-extrabold text-white tracking-tight leading-[1.05] sm:leading-[1.05] font-sans max-w-2xl px-4">
        Unified API Platform for Web, Mobile, and Automation
      </h2>

      {/* Subtle description */}
      <p className="text-[14px] sm:text-[17px] text-zinc-500 leading-relaxed font-sans max-w-[540px] mx-auto px-4 mt-1">
        Connect your apps, bots, and websites easily. Fast setup, reliable performance, and pricing that fits your budget — so you can focus on building, not on billing.
      </p>

      {/* Elegant buttons group */}
      <div className="flex items-center justify-center gap-3 pt-6">
        <button
          onClick={onGetStarted}
          className="px-10 py-3.5 bg-white hover:bg-zinc-200 text-black font-extrabold rounded-lg text-[15px] transition-all"
        >
          Get Started
        </button>
        <button
          onClick={onViewVitals}
          className="p-3.5 border border-zinc-700 bg-transparent hover:bg-zinc-900/50 text-zinc-400 hover:text-white rounded-lg transition-all flex items-center justify-center aspect-square"
          title="Library"
        >
          <Library className="h-5 w-5" />
        </button>
      </div>
      
      <div className="pt-6 text-2xl sm:text-3xl font-extrabold text-white uppercase tracking-tight font-sans">
        API Statistics
      </div>
    </section>
  );
};
