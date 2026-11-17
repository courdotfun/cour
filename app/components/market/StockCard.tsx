import { STOCK_NAME, STOCK_PRICE, STOCK_LOGOS } from "@/lib/stocks";
import { Spark } from "./Spark";

// Port of v8 stockCard(). Price/chg/spark are time-dependent data (masked in the
// parity harness). Links are added when /stock/[symbol] lands.
export function StockCard({ sym }: { sym: string }) {
  const price = STOCK_PRICE[sym] ?? 0;
  const logo = STOCK_LOGOS[sym];
  return (
    <div className="card stk-card" data-stk={sym}>
      <div className="card-top">
        <div className="ava" style={{ background: "#fff" }}>
          {logo ? <img src={logo} alt="" style={{ width: "58%", height: "58%", objectFit: "contain" }} /> : sym[0]}
        </div>
        <div>
          <div className="name">{sym}</div>
          <div className="tick">{STOCK_NAME[sym] ?? sym}</div>
        </div>
        <span className="badge b-trend">24/7 token</span>
      </div>
      <div className="mc-row">
        <div>
          <div className="mc-label">Price</div>
          <div className="mc stk-px">${price.toFixed(2)}</div>
        </div>
        <div className="chg stk-chg up">▲ 0.00%</div>
      </div>
      <div className="stk-sp"><Spark data={[5, 6, 6, 7, 8, 8, 9, 10]} pos /></div>
      <div className="card-foot"><span>Tokenized · 1:1 share</span></div>
    </div>
  );
}
