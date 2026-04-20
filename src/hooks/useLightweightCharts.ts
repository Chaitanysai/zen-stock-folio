import { useEffect, useRef, useState } from "react";

interface ChartLib {
  createChart: any;
  ColorType: any;
}

/**
 * Hook to safely load lightweight-charts library
 * Handles both static and dynamic imports with proper error reporting
 */
export function useLightweightCharts() {
  const [lib, setLib] = useState<ChartLib | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadAttempted = useRef(false);

  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;

    const loadCharts = async () => {
      try {
        // Try static import first
        const { createChart, ColorType } = await import("lightweight-charts");
        setLib({ createChart, ColorType });
        setIsLoading(false);
      } catch (staticErr) {
        console.warn("Static import failed, trying dynamic import:", staticErr);
        try {
          // Fallback to dynamic import with explicit error handling
          const module = await import("lightweight-charts");
          setLib({
            createChart: module.createChart,
            ColorType: module.ColorType,
          });
          setIsLoading(false);
        } catch (dynamicErr) {
          console.error("Failed to load lightweight-charts:", dynamicErr);
          setError(
            "lightweight-charts module not found. Please ensure it's installed: npm install lightweight-charts"
          );
          setIsLoading(false);
        }
      }
    };

    loadCharts();
  }, []);

  return { lib, error, isLoading };
}
