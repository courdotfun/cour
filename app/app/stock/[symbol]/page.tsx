import { notFound } from "next/navigation";
import { loadStock } from "@/lib/server/stock";
import { StockView } from "@/components/stock/StockView";

export const revalidate = 30;

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} — tokenized stock — COUR` };
}

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const d = await loadStock(symbol);
  if (!d) notFound();
  return <StockView d={d} />;
}
