/**
 * The single, shared site footer. It is rendered once by `AppShell`, so it
 * automatically appears on every authenticated page (and any future page that
 * renders inside the shell) with identical content and behavior.
 *
 * Behavior is defined by `.site-footer` in `src/index.css`:
 * - Desktop / tablet: the shell is a fixed-height column, so the footer is
 *   pinned chrome at the bottom of the viewport while `.app-main` scrolls.
 * - Mobile (<= 767px): the shell scrolls at the page level, so the footer is
 *   end-of-page content that flows below the page content (scroll to reveal),
 *   instead of stealing height from the viewport.
 *
 * Keep this as the only footer — don't add page-local footers, so the
 * experience stays consistent everywhere.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Skulls &amp; Trading · Built for conviction, discipline, and the setup.</p>
    </footer>
  );
}
