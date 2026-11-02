import { cn } from "@/lib/utils";
import type { CSSProperties, HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
};

export function Skeleton({ className, width, height, radius, style, ...props }: SkeletonProps) {
  const merged: CSSProperties = { width, height, borderRadius: radius, ...style };
  return <div aria-hidden="true" className={cn("zf-skeleton-block", className)} style={merged} {...props} />;
}

export function SkeletonText({ lines = 3, widths = ["100%", "92%", "64%"] }:
  { lines?: number; widths?: string[] }) {
  return (
    <div aria-hidden="true" className="zf-skeleton-text">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={widths[i % widths.length]} radius={4} />
      ))}
    </div>
  );
}
