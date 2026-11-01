export const tradeBookFixture = {
  data: {
    trades: [
      {
        trade_id: "T1001",
        exchange: "NSE",
        tradingsymbol: "RELIANCE-EQ",
        transaction_type: "BUY",
        quantity: "10",
        average_price: "2450",
        exchange_timestamp: "2026-01-10T04:30:00Z",
      },
      {
        exchange: "NSE",
        tradingSymbol: "RELIANCE",
        transactionType: "S",
        quantity: 4,
        price: 2500,
        exchangeTimestamp: 1768003200,
      },
      {
        trade_id: "T1003",
        exchange: "NSE",
        tradingsymbol: "TCS",
        transaction_type: "SIDEWAYS",
        quantity: 1,
        price: 3900,
        exchange_timestamp: "2026-01-11T04:30:00Z",
      },
    ],
  },
};
