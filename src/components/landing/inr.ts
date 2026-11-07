/** Indian-rupee formatting for landing sample figures (en-IN lakh grouping). */
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const formatINR = (value: number) => inr.format(Math.round(value));
