/**
 * Bare layout for printable pages — escapes the customer header/footer
 * so the page is a clean sheet that browsers can save as PDF.
 */
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
