import { notFound } from "next/navigation";
import { loadToken } from "@/lib/server/token";
import { TokenView } from "@/components/token/TokenView";
import { normAddr } from "@/lib/util/address";

export const revalidate = 10;

export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const addr = normAddr((await params).address);
  if (!addr) notFound();
  const d = await loadToken(addr);
  if (!d) notFound();
  return <TokenView d={d} />;
}
