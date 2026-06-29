import Link from 'next/link';
import { WOMEN_TAXONOMY } from '@/lib/womenTaxonomy';

const sub = (s: string) => `/products?category=women&subcategory=${encodeURIComponent(s)}`;

export default function WomenCategoryMenu() {
  return (
    <section style={{ maxWidth: 1200, margin: '1.5rem auto', padding: '0 1rem' }}>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#a7354d', margin: '0 0 .9rem' }}>
        Shop Women by Category
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.75rem' }}>
        {WOMEN_TAXONOMY.map(group => (
          <details key={group.name} style={{ border: '1px solid #f0d9df', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
            <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '.7rem .9rem', fontWeight: 700, fontSize: '.92rem', color: '#7a0a22', background: '#fdf0f3' }}>
              {group.name}
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', padding: '.4rem .9rem .7rem' }}>
              <Link href={sub(group.name)} style={{ padding: '.32rem 0', fontSize: '.85rem', fontWeight: 600, color: '#a7354d', textDecoration: 'none' }}>
                All {group.name}
              </Link>
              {group.variants.map(v => (
                <Link key={v} href={sub(v)} style={{ padding: '.3rem 0', fontSize: '.83rem', color: '#555', textDecoration: 'none' }}>
                  {v}
                </Link>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
