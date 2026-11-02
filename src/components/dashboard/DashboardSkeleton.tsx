import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

interface DashboardSkeletonProps {
  label?: string;
}

export function DashboardSkeleton({ label = "Loading your dashboard" }: DashboardSkeletonProps) {
  return (
    <div className="zf-shell-skel" role="status" aria-live="polite" aria-busy="true">
      <span className="zf-sr-only">{label}</span>

      <div className="zf-skel-rail" aria-hidden="true">
        <Skeleton width={40} height={40} radius={999} />
        <Skeleton width={40} height={40} radius={999} />
        <Skeleton width={40} height={40} radius={999} />
      </div>

      <div className="zf-main-skel">
        <div className="zf-skel-top">
          <Skeleton width={104} height={34} radius={10} />
          <div className="zf-skel-pills">
            <Skeleton width={84} height={32} radius={999} />
            <Skeleton width={84} height={32} radius={999} />
            <Skeleton width={84} height={32} radius={999} />
          </div>
          <Skeleton width={40} height={40} radius={999} />
        </div>

        <div className="zf-skel-head">
          <Skeleton width={320} height={40} radius={10} />
          <Skeleton width={220} height={16} radius={6} />
        </div>

        <div className="zf-skel-cards">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="zf-skel-card">
              <Skeleton width="45%" height={11} radius={4} />
              <Skeleton width="70%" height={30} radius={8} />
              <Skeleton width="38%" height={11} radius={4} />
            </div>
          ))}
        </div>

        <div className="zf-skel-columns">
          <div className="zf-skel-card zf-skel-holdings">
            <Skeleton width="32%" height={18} radius={6} />
            <Skeleton width="64%" height={11} radius={4} />
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="zf-skel-row">
                <Skeleton width={36} height={36} radius={999} />
                <Skeleton width="40%" height={12} radius={4} />
                <Skeleton width="20%" height={12} radius={4} />
                <Skeleton width={72} height={14} radius={4} style={{ marginLeft: "auto" }} />
              </div>
            ))}
          </div>

          <div className="zf-skel-stack">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="zf-skel-card">
                <Skeleton width="50%" height={14} radius={5} />
                <SkeletonText lines={2} widths={["100%", "72%"]} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardSkeleton;
