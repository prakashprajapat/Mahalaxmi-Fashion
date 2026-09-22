'use client';
import type { GateResult } from '@/lib/productGate';

// What is keeping this product off the website, shown while the form is being
// filled in rather than in a popup after saving.
//
// A browser alert was the wrong shape for this twice over: it appears after the
// work is done, and it disappears the moment it is dismissed — so the list of
// things to fix is gone exactly when it is needed. This sits above the form,
// updates as the boxes are filled, and turns green when the product is ready.

const LABEL: Record<string, string> = {
  name: 'Product name',
  description: 'Description',
  image: 'Photo',
  price: 'Price',
  category: 'Category',
  subcategory: 'Subcategory',
  sizes: 'Sizes',
  colours: 'Colour',
  sku: 'SKU',
  hsn: 'HSN code',
};

/** Where in this form each thing is set — a fault nobody can find is not really reported. */
const WHERE: Record<string, string> = {
  sizes: 'Sizes section below, or the "Size" box under Product Details',
  colours: 'Colours section below, or the "Colour" box under Product Details',
  subcategory: 'the Subcategory box at the top',
  image: 'Product Photos → Front View',
  description: 'the Description box',
  name: 'the Product Name box',
};

export default function PublishPanel({
  gate,
  serverSaid,
}: {
  gate: GateResult;
  /** What the server replied on the last save — the authority, when it disagrees. */
  serverSaid?: { heldAsDraft: boolean; errors: { field: string; message: string }[] } | null;
}) {
  const ready = gate.passed;
  const issues = gate.blocking;

  return (
    <div
      style={{
        border: `1px solid ${ready ? '#c3e3c8' : '#f0d8b0'}`,
        background: ready ? '#f2faf3' : '#fffaf0',
        borderRadius: 12,
        padding: '1rem 1.15rem',
        marginBottom: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <span
          style={{
            background: ready ? '#2e7d32' : '#c26a12',
            color: '#fff', borderRadius: 20, padding: '3px 12px',
            fontSize: '.72rem', fontWeight: 800, letterSpacing: '.03em',
          }}
        >
          {ready ? 'READY TO PUBLISH' : `DRAFT — ${issues.length} TO FIX`}
        </span>
        <span style={{ fontSize: '.86rem', color: ready ? '#2e7d32' : '#8a5a12', fontWeight: 600 }}>
          {ready
            ? 'Everything Google asks for is here. Saving will put this product on the website.'
            : 'Saving keeps your work, but this product stays off the website until these are fixed.'}
        </span>
      </div>

      {!ready && (
        <ul style={{ margin: '.8rem 0 0', paddingLeft: '1.2rem' }}>
          {issues.map((i, k) => (
            <li key={k} style={{ fontSize: '.86rem', color: '#5c3d0c', lineHeight: 1.6, marginBottom: '.35rem' }}>
              <strong>{LABEL[i.field] ?? i.field}:</strong> {i.message}
              {WHERE[i.field] && (
                <span style={{ color: '#a08050' }}> — set it in {WHERE[i.field]}.</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {gate.warnings.length > 0 && (
        <details style={{ marginTop: '.7rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '.8rem', color: '#888', fontWeight: 600 }}>
            {gate.warnings.length} suggestion{gate.warnings.length === 1 ? '' : 's'} — these do not stop publishing
          </summary>
          <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.2rem' }}>
            {gate.warnings.map((w, k) => (
              <li key={k} style={{ fontSize: '.82rem', color: '#999', lineHeight: 1.55 }}>
                <strong>{LABEL[w.field] ?? w.field}:</strong> {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* The server checks again on save. If it disagrees with the list above —
          a rule this file has not caught up with — its answer is the real one. */}
      {serverSaid?.heldAsDraft && serverSaid.errors.length > 0 && (
        <div style={{ marginTop: '.85rem', paddingTop: '.75rem', borderTop: '1px solid #f0e0c0' }}>
          <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#c0392b', marginBottom: '.35rem' }}>
            The server kept this as a draft on the last save:
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {serverSaid.errors.map((e, k) => (
              <li key={k} style={{ fontSize: '.84rem', color: '#c0392b', lineHeight: 1.55 }}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
