import { getSectorAllocation, PortfolioStock } from "@/data/sampleData";
import { PieChart as PieChartIcon } from "lucide-react";
import { buildSectorSegments, isConcentrated } from "@/lib/portfolio/sectorMeter";

interface SectorDiversificationProps {
  stocks: PortfolioStock[];
}

const SectorDiversification = ({ stocks }: SectorDiversificationProps) => {
  const sectorData = getSectorAllocation(stocks);

  if (sectorData.length === 0) {
    return (
      <div className="glass-card">
        <div className="zf-empty-state">
          <div className="zf-empty-icon" aria-hidden="true"><PieChartIcon /></div>
          <h3 className="zf-empty-title">No active positions for sector analysis</h3>
          <p className="zf-empty-body">
            Once you hold open positions, their invested value is grouped by sector here.
          </p>
        </div>
      </div>
    );
  }

  const segments = buildSectorSegments(sectorData);
  const topSector = sectorData[0];
  const totalInvested = sectorData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Sector Diversification
          </h2>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Active portfolio breakdown
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-mono font-semibold text-primary">
            {topSector.sector}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            top sector · {topSector.percentage.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="p-5">
        <div
          className="zf-meter zf-meter-lg"
          role="img"
          aria-label={`Sector allocation: ${segments.map((s) => `${s.label} ${s.pct.toFixed(1)}%`).join(", ")}`}
        >
          {segments.map((s) => (
            <span
              key={s.id}
              className="zf-meter-seg"
              data-other={s.isOther || undefined}
              style={{ width: `max(2px, ${s.widthPct}%)`, background: s.color }}
              title={`${s.label} · ${s.pct.toFixed(1)}%`}
            />
          ))}
        </div>
        <div className="zf-prog-meta">
          <span>₹{Math.round(totalInvested).toLocaleString("en-IN")} invested</span>
          <span>100% of active holdings</span>
        </div>

        <ul className="zf-sector-legend zf-sector-legend-lg" aria-label="Sector allocation">
          {segments.map((s, i) => (
            <li key={s.id}>
              <span className="zf-legend-dot" style={{ background: s.color }} aria-hidden="true" />
              <span className="zf-sector-name">{s.label}</span>
              <span className="zf-sector-val">₹{Math.round(sectorData[i]?.value ?? 0).toLocaleString("en-IN")}</span>
              <span className="zf-sector-pct">{s.pct.toFixed(1)}%</span>
            </li>
          ))}
        </ul>

        {isConcentrated(sectorData) && (
          <p className="zf-conc-badge">Concentrated · {topSector.sector} {topSector.percentage.toFixed(0)}%</p>
        )}
      </div>
    </div>
  );
};

export default SectorDiversification;
