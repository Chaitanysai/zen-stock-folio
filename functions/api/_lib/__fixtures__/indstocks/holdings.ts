/**
 * Shape captured from INDstocks' documented holdings response, with the field
 * aliases the adapter must tolerate. Kept as TypeScript (not JSON) because the
 * Functions tsconfig does not enable resolveJsonModule.
 */
export const holdingsFixture = {
  status: "success",
  data: [
    { exchange: "NSE", tradingsymbol: "RELIANCE", isin: "INE002A01018", quantity: 15, average_price: "2450", ltp: 2612.35 },
    { exchangeSegment: "NSE", tradingSymbol: "TCS", quantity: "8", averagePrice: 3920.5 },
    { exchange: "BSE", tradingsymbol: "BSEONLY", quantity: 5, average_price: 100, ltp: 105 },
    { exchange: "NSE", tradingsymbol: "", quantity: 1, average_price: 10 },
  ],
};
