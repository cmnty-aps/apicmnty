import React from "react";
import { BadgeCheck, Activity } from "lucide-react";

interface LandingHeroProps {
  onGetStarted: () => void;
  onViewVitals: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onGetStarted, onViewVitals }) => {
  return (
    <main className="flex-1 w-full max-w-3xl md:max-w-5xl mx-auto px-4 md:px-8 pt-4 pb-8 overflow-x-hidden">
      <section className="text-center md:text-left pt-10 pb-2 md:pt-12 md:pb-6">
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
          <div className="md:flex-1">
            <div className="inline-flex items-center gap-1 px-4 py-1.5 mb-6 text-sm font-semibold text-gray-400 border border-[#2E2E2E] bg-[#212121] rounded-full">
              <i className="bi bi-patch-check-fill text-white text-[16px] align-middle"></i>
              <span>#1 Unlimited Free API Service</span>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Next-Gen API Platform for Web, Mobile, and Automation
            </h1>
            
            <p className="text-base md:text-base text-gray-400 mb-10 max-w-2xl leading-relaxed mx-auto md:mx-0">
              Connect your apps, bots, and websites effortlessly. Quick setup, reliable performance, and free — so you can focus on building.
            </p>
            
            <div className="flex flex-row items-center md:items-start justify-center md:justify-start gap-3 max-w-sm mx-auto md:mx-0">
              <a 
                href="/docs"
                onClick={(e) => { e.preventDefault(); onGetStarted(); }}
                className="w-52 md:w-40 py-2 bg-white border border-[#383838] text-black font-bold text-base rounded-lg transition-all flex items-center justify-center whitespace-nowrap hover:bg-zinc-200"
              >
                Get Started
              </a>
              
              <a 
                href="#statistic"
                onClick={(e) => { e.preventDefault(); onViewVitals(); }}
                className="w-12 md:w-40 py-2 bg-[#212121] border border-[#383838] text-gray-400 hover:text-black font-bold hover:bg-white text-base rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <i className="bi bi-activity text-base"></i>
                <span className="hidden md:inline">Statistic API</span>
              </a>
            </div>
          </div>
        </div>
      </section>
      
      <div className="pt-10 md:pt-16 pb-4 text-center md:text-left text-2xl sm:text-3xl font-extrabold text-white uppercase tracking-tight font-sans underline decoration-white/30 underline-offset-8">
        Statistic API
      </div>
    </main>
  );
};

