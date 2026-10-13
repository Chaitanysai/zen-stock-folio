import { useMemo } from "react";

interface LoginHeroVisualsProps {
  className?: string;
}

/**
 * Premium market-inspired visuals for the login hero section
 * Lightweight SVG-based visuals with glassmorphism effects
 */
export default function LoginHeroVisuals({ className = "" }: LoginHeroVisualsProps) {
  // Candlestick data for the main chart
  const candles = useMemo(() => {
    const data = [];
    for (let i = 0; i < 18; i++) {
      const isGreen = i % 3 !== 0;
      const volatility = 0.3 + Math.random() * 0.7;
      const bodyHeight = 20 + Math.random() * 30 * volatility;
      const wickTop = 5 + Math.random() * 20 * volatility;
      const wickBottom = 5 + Math.random() * 20 * volatility;
      
      data.push({
        isGreen,
        bodyHeight,
        wickTop,
        wickBottom,
        x: i * 28 + 20,
        y: 180,
      });
    }
    return data;
  }, []);

  // Volume bars data
  const volumes = useMemo(() => {
    const data = [];
    for (let i = 0; i < 18; i++) {
      const height = 15 + Math.random() * 50;
      const isGreen = i % 3 !== 0;
      data.push({ height, isGreen, x: i * 28 + 22 });
    }
    return data;
  }, []);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* Background atmospheric effects */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-amber-400/10 via-orange-300/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-gradient-to-tl from-green-400/10 via-emerald-300/5 to-transparent rounded-full blur-2xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-navy-900/20 to-purple-900/10 rounded-full blur-3xl" />
      </div>

      {/* Main SVG for charts */}
      <svg 
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 500 400"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {/* Grid lines */}
        <g opacity="0.4">
          {[50, 100, 150, 200, 250, 300, 350].map((y) => (
            <line key={`h-${y}`} x1="20" y1={y} x2="480" y2={y} 
                  stroke="#142033" strokeWidth="0.5" strokeOpacity="0.1" strokeDasharray="4 2"/>
          ))}
          {[50, 100, 150, 200, 250, 300, 350, 400, 450].map((x) => (
            <line key={`v-${x}`} x1={x} y1="20" x2={x} y2="380"
                  stroke="#142033" strokeWidth="0.5" strokeOpacity="0.08" strokeDasharray="2 2"/>
          ))}
        </g>

        {/* Candlestick chart */}
        <g transform="translate(0, 20)">
          {candles.map((candle, index) => {
            const centerX = candle.x + 12;
            const bodyTop = candle.y - candle.bodyHeight / 2;
            const bodyBottom = candle.y + candle.bodyHeight / 2;
            const topWick = bodyTop - candle.wickTop;
            const bottomWick = bodyBottom + candle.wickBottom;
            
            return (
              <g key={`c-${index}`}>
                <line x1={centerX} y1={topWick} x2={centerX} y2={bodyTop} 
                      stroke={candle.isGreen ? "#15803d" : "#c94444"} strokeWidth="1.5" strokeLinecap="round"/>
                <rect x={candle.x + 4} y={bodyTop} width="16" height={candle.bodyHeight}
                      fill={candle.isGreen ? "#15803d" : "#c94444"} rx="2"/>
                <line x1={centerX} y1={bodyBottom} x2={centerX} y2={bottomWick}
                      stroke={candle.isGreen ? "#15803d" : "#c94444"} strokeWidth="1.5" strokeLinecap="round"/>
              </g>
            );
          })}
        </g>

        {/* Volume bars */}
        <g transform="translate(0, 300)">
          {volumes.map((vol, index) => (
            <rect key={`vb-${index}`} x={vol.x} y={50 - vol.height} width="22" height={vol.height}
                  fill={vol.isGreen ? "rgba(21, 128, 61, 0.18)" : "rgba(201, 68, 68, 0.18)"} rx="2"/>
          ))}
        </g>

        {/* Trend line */}
        <path d="M 30 120 Q 130 100 230 130 T 470 140" 
              fill="none" stroke="#C4A574" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>

        {/* Floating glass panels */}
        <g transform="translate(40, 50)">
          <rect x="0" y="0" width="120" height="60" fill="rgba(255, 255, 255, 0.08)" 
                stroke="rgba(20, 32, 51, 0.15)" strokeWidth="1" rx="8"/>
          <rect x="2" y="2" width="116" height="56" fill="rgba(255, 255, 255, 0.04)" rx="6"/>
        </g>
        <g transform="translate(350, 120)">
          <rect x="0" y="0" width="100" height="50" fill="rgba(255, 255, 255, 0.06)" 
                stroke="rgba(20, 32, 51, 0.12)" strokeWidth="1" rx="6"/>
          <rect x="2" y="2" width="96" height="46" fill="rgba(255, 255, 255, 0.03)" rx="4"/>
        </g>

        {/* Decorative elements */}
        <g opacity="0.4">
          {[30, 80, 130, 180, 230, 280, 330, 380, 430, 470].map((x, i) => (
            <circle key={`d-${i}`} cx={x} cy={i % 2 === 0 ? 80 : 320} r="1" fill="#C4A574"/>
          ))}
        </g>
      </svg>

      {/* Floating metrics */}
      <div className="absolute w-full h-full pointer-events-none">
        <div className="absolute top-[12%] left-[10%] transform -rotate-1">
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl px-4 py-3 shadow-lg">
            <div className="text-amber-500/80 text-[10px] font-medium tracking-wide uppercase">Market Depth</div>
            <div className="text-white/50 text-[8px] mt-1">Illustrative</div>
          </div>
        </div>
        <div className="absolute top-[35%] right-[15%] transform rotate-2">
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl px-4 py-3 shadow-lg">
            <div className="text-green-500/80 text-[10px] font-medium tracking-wide uppercase">Volume</div>
            <div className="text-white/50 text-[8px] mt-1">Illustrative</div>
          </div>
        </div>
        <div className="absolute bottom-[18%] left-[40%] transform rotate-1">
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl px-4 py-3 shadow-lg">
            <div className="text-red-500/80 text-[10px] font-medium tracking-wide uppercase">Trend</div>
            <div className="text-white/50 text-[8px] mt-1">Illustrative</div>
          </div>
        </div>
      </div>
    </div>
  );
}
