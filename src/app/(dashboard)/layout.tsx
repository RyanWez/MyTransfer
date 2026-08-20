import Shell from "@/components/Shell";
import Toasts from "@/components/Toasts";

/**
 * Dashboard-only chrome. The login page lives outside this group so it renders
 * without the sidebar/topbar (and without needing a session).
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Shell>{children}</Shell>
      <Toasts />
    </>
  );
}
