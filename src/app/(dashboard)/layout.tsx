import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import Sidebar from "@/components/ui/sidebar";
import { getSubscriptionContext } from "@/server/subscription";
import { requireOrgContext } from "@/server/tenant";
import Link from "next/link";
import { CommandPaletteProvider } from "@/components/ui/CommandPalette";
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Subscription Check
  let banner = null;
  let orgId: string | undefined = undefined;
  try {
    const ctx = await requireOrgContext();
    orgId = ctx.organizationId;
    const { status, trialDaysRemaining, subscription } = await getSubscriptionContext(ctx.organizationId);
    
    if (status === "TRIAL_EXPIRED" || status === "SUBSCRIPTION_EXPIRED") {
      banner = (
        <div className="bg-red-600 text-white px-4 py-3 sm:px-6 lg:px-8 text-center text-sm font-medium">
          {status === "TRIAL_EXPIRED" ? "Your free trial has expired." : "Your subscription is inactive."} 
          <Link href="/pricing" className="ml-2 underline hover:text-red-100">Upgrade to continue using EZBILLZ</Link>
        </div>
      );
    } else if (status === "TRIAL_ACTIVE") {
      banner = (
        <div className="bg-amber-600 text-white px-4 py-3 sm:px-6 lg:px-8 text-center text-sm font-medium">
          Your free trial expires in {trialDaysRemaining} days.
          <Link href="/pricing" className="ml-2 underline hover:text-amber-100">Upgrade now</Link>
        </div>
      );
    }
  } catch (err) {
    // Context might not be available or user has no orgs yet
  }

  return (
    <CommandPaletteProvider orgId={orgId}>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
        {banner}
        {/* Mobile top-bar spacer */}
        <div className="lg:hidden h-14 flex-shrink-0" />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
    </CommandPaletteProvider>
  );
}
