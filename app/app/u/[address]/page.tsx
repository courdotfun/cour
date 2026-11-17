import { notFound } from "next/navigation";
import { UserView } from "@/components/profile/UserView";
import { normAddr } from "@/lib/util/address";

export const metadata = { title: "User — COUR" };

export default async function UserPage({ params }: { params: Promise<{ address: string }> }) {
  const addr = normAddr((await params).address);
  if (!addr) notFound();
  return <UserView address={addr} />;
}
