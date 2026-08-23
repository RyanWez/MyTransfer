import Shell from "@/components/Shell";
import Toasts from "@/components/Toasts";
import { InactivityProvider } from "@/components/InactivityProvider";

/**
 * Dashboard-only chrome. The login page lives outside this group so it renders
 * without the sidebar/topbar (and without needing a session).
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <InactivityProvider>
      <Shell>{children}</Shell>
      <Toasts />
    </InactivityProvider>
  );
}
