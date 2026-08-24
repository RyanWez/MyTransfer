/**
 * Remounts on every route change inside the dashboard group, so incoming
 * pages fade-and-rise into place instead of snapping — the sidebar click
 * reads as a transition, not a cut.
 *
 * Entrance only: exit animations in the App Router need AnimatePresence
 * workarounds that fight streaming, and a clean entrance is what makes
 * navigation feel smooth anyway. Reduced-motion users get an instant swap
 * via the global CSS override.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
