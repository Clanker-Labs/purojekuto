import { Shell } from "@/components/shell";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <Shell userName={user.name}>{children}</Shell>;
}
