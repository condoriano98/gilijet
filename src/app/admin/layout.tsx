import type { Metadata } from 'next';

// Admin pages already name their own section ("Webhooks · Admin",
// "Boats · Operations"), so the template passes them through unchanged.
export const metadata: Metadata = {
  title: { absolute: 'Admin · Gilifast', template: '%s' },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
