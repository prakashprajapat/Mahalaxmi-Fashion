import type { Metadata } from 'next';

// A supplier enquiry form with nothing for a searcher to read.
//
// robots.txt had tried to keep this out with "Disallow: /become-supplier/" — a trailing
// slash the route does not have, so it matched nothing and the page stayed
// indexable. Disallow would have been the wrong tool even spelled correctly:
// it stops Google reading the page, and a page Google cannot read is a page
// that never learns it should not be indexed. noindex, follow does the job —
// keep the page out, still follow its links.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
