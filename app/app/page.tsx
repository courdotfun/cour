import { loadMarket } from "@/lib/server/market";
import { Market } from "@/components/market/Market";

// Home / Market view (ported from v8 #home) — real indexer data, no demo tokens.
export const revalidate = 10;

export default async function Home() {
  const data = await loadMarket();
  return <Market data={data} />;
}
