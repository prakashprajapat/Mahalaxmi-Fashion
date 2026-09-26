'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getAdminToken } from '@/lib/auth';
import { PageHeader, Stat } from '@/components/admin/Ui';

// The SEO screen. One button, one honest report.
//
// This used to scan products in the browser and show a table. That was fine as
// far as it went, but the browser cannot see the sitemap, robots.txt, or the
// admin-only settings that decide the homepage title — which is where the
// faults that actually cost traffic tend to live. The scan now runs on the
// server, in app/(admin)/admin/seo/audit/route.ts.

type Severity = 'critical' | 'warning' | 'info';

interface FindingItem {
  label: string;
  href?: string;
  note?: string;
}

interface Finding {
  id: string;
  severity: Severity;
  area: string;
  title: string;
  detail: string;
  fix: string;
  count?: number;
  items?: FindingItem[];
}

interface Report {
  ranAt: string;
  checksRun: number;
  checksPassed: number;
  productCount: number;
  productsError: string | null;
  sitemapUrls: number;
  findings: Finding[];
  counts: { critical: number; warning: number; info: number };
}

const SEVERITY: Record<Severity, { label: string; colour: string; tint: string }> = {
  critical: { label: 'Fix first', colour: '#c0392b', tint: '#fdecea' },
  warning:  { label: 'Worth fixing', colour: '#c26a12', tint: '#fff5e6' },
  info:     { label: 'Nice to have', colour: '#2b6cb0', tint: '#ebf4fb' },
};

function FindingCard({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  const s = SEVERITY[f.severity];
  const items = f.items ?? [];

  return (
    <div style={{ background: '#fff', border: '1px solid #eae3e4', borderLeft: `4px solid ${s.colour}`, borderRadius: 10, padding: '1rem 1.15rem', marginBottom: '.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.4rem' }}>
        <span style={{ background: s.tint, color: s.colour, borderRadius: 20, padding: '2px 10px', fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>
          {s.label}
        </span>
        <span style={{ fontSize: '.74rem', color: '#9a908a', fontWeight: 600 }}>{f.area}</span>
      </div>

      <h3 style={{ margin: '0 0 .35rem', fontSize: '1rem', fontWeight: 700, color: '#222' }}>{f.title}</h3>
      <p style={{ margin: '0 0 .5rem', fontSize: '.86rem', color: '#555', lineHeight: 1.55 }}>{f.detail}</p>
      <p style={{ margin: 0, fontSize: '.86rem', color: '#222', lineHeight: 1.55 }}>
        <strong style={{ color: s.colour }}>What to do:</strong> {f.fix}
      </p>

      {items.length > 0 && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            style={{ marginTop: '.7rem', background: 'none', border: '1px solid #e5dcdd', borderRadius: 6, padding: '.3rem .7rem', fontSize: '.78rem', fontWeight: 700, color: '#555', cursor: 'pointer' }}
          >
            {open ? 'Hide' : `Show ${items.length}${(f.count ?? items.length) > items.length ? ` of ${f.count}` : ''}`}
          </button>

          {open && (
            <ul style={{ listStyle: 'none', margin: '.7rem 0 0', padding: 0, borderTop: '1px solid #f2f2f2' }}>
              {items.map((it, i) => (
                <li key={`${it.label}-${i}`} style={{ padding: '.45rem 0', borderBottom: '1px solid #f7f7f7', fontSize: '.84rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
                  <span>
                    {it.href ? (
                      <Link href={it.href} style={{ color: '#722f37', fontWeight: 600, textDecoration: 'none' }}>{it.label}</Link>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{it.label}</span>
                    )}
                  </span>
                  {it.note && <span style={{ color: '#9a908a', fontSize: '.78rem', whiteSpace: 'nowrap' }}>{it.note}</span>}
                </li>
              ))}
              {(f.count ?? 0) > items.length && (
                <li style={{ padding: '.5rem 0', fontSize: '.78rem', color: '#9a908a' }}>
                  …and {(f.count ?? 0) - items.length} more.
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function SeoPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const token = getAdminToken();
      const res = await fetch('/admin/seo/audit', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || `The check could not run (error ${res.status}).`);
        return;
      }
      setReport(data as Report);
    } catch {
      setError('Could not reach the server. Check that the site and the API are both up, then try again.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="admin-page">
      <PageHeader
        title="SEO check"
        sub="Scans the whole site and lists what is actually broken. Running it changes nothing."
        right={
          <button className="adm-btn adm-btn-primary" onClick={run} disabled={running}>
            {running ? 'Checking…' : report ? 'Run again' : 'Run the full check'}
          </button>
        }
      />

      {error && (
        <div className="adm-card" style={{ background: '#fdf3f2', borderColor: '#f0cdc9', color: '#c0392b', marginBottom: '.85rem', fontSize: '.86rem', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!report && !running && !error && (
        <div style={{ background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, padding: '2rem', fontSize: '.9rem', color: '#555', lineHeight: 1.65 }}>
          <p style={{ marginTop: 0 }}>
            Press the button and this will check your homepage title and description, every collection and category
            page, your sitemap and robots.txt, and all your products — then list what is wrong, worst first, with a
            link to the screen where each one is fixed.
          </p>
          <p style={{ marginBottom: 0, color: '#8a7f76' }}>
            One thing it cannot do, and no tool honestly can: make you rank. Rankings come from backlinks, your
            Google Business Profile and content people want. This finds the mechanical faults that quietly hold the
            shop back — empty pages, missing descriptions, two pages fighting over one keyword — so the rest of your
            effort is not wasted.
          </p>
        </div>
      )}

      {running && (
        <div style={{ background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, padding: '3rem', textAlign: 'center', color: '#9a908a' }}>
          Reading the sitemap, settings, collections and every product…
        </div>
      )}

      {report && !running && (
        <>
          <div className="adm-grid-3" style={{ marginBottom: '.85rem' }}>
            <Stat label="Fix first" value={report.counts.critical}
                  tone={report.counts.critical ? 'red' : 'green'} />
            <Stat label="Worth fixing" value={report.counts.warning}
                  tone={report.counts.warning ? 'red' : 'green'} />
            <Stat label="Nice to have" value={report.counts.info} />
            <Stat label="Checks passed" value={`${report.checksPassed}/${report.checksRun}`} />
            <Stat label="Products scanned" value={report.productCount} />
            <Stat label="Pages in sitemap" value={report.sitemapUrls} />
          </div>

          {report.productsError && (
            <div style={{ background: '#fff5e6', border: '1px solid #f0d8b0', color: '#c26a12', borderRadius: 10, padding: '.9rem 1.1rem', marginBottom: '1rem', fontSize: '.86rem' }}>
              The product API did not answer, so every product check below was skipped — this report is incomplete.
              ({report.productsError})
            </div>
          )}

          {report.findings.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #eae3e4', borderRadius: 13, padding: '3rem', textAlign: 'center', color: '#2e7d32' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>✅</div>
              <p style={{ margin: 0, fontWeight: 600 }}>All {report.checksRun} checks passed.</p>
              <p style={{ margin: '.4rem 0 0', color: '#8a7f76', fontSize: '.85rem' }}>
                Nothing mechanical is holding the site back. What is left is backlinks, your Google Business
                Profile, and writing.
              </p>
            </div>
          ) : (
            report.findings.map(f => <FindingCard key={f.id} f={f} />)
          )}

          <p style={{ fontSize: '.78rem', color: '#a49a94', marginTop: '1rem' }}>
            Checked {new Date(report.ranAt).toLocaleString('en-IN')}. Nothing on the site was changed.
          </p>
        </>
      )}
    </div>
  );
}
