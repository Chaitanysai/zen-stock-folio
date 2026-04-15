export function parseTradingDate(value?: string | null): Date | null {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(value)) {
    const [day, month, year] = value.split("-");
    return new Date(`${month} ${day}, ${year}`);
  }

  if (/^\d{1,2}-\d{2}-\d{4}$/.test(value)) {
    const [day, month, year] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isSameTradingDay(value: string | undefined, target = new Date()): boolean {
  const parsed = parseTradingDate(value);
  if (!parsed) return false;

  return (
    parsed.getFullYear() === target.getFullYear() &&
    parsed.getMonth() === target.getMonth() &&
    parsed.getDate() === target.getDate()
  );
}

export function buildTrendSeries(
  currentPrice: number,
  changePercent: number,
  seed: string,
  points = 24
) {
  const safeCurrent = currentPrice > 0 ? currentPrice : 1;
  const startPrice = safeCurrent / (1 + changePercent / 100 || 1);
  const seedValue = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return Array.from({ length: points }, (_, index) => {
    const progress = points === 1 ? 1 : index / (points - 1);
    const drift = startPrice + (safeCurrent - startPrice) * progress;
    const wave = Math.sin(progress * Math.PI * 2 + seedValue * 0.07) * safeCurrent * 0.01;
    const micro = Math.cos(progress * Math.PI * 5 + seedValue * 0.03) * safeCurrent * 0.0035;
    const price = index === points - 1 ? safeCurrent : Math.max(0.01, drift + wave + micro);

    return {
      label: `${Math.round(progress * 100)}%`,
      price,
    };
  });
}
