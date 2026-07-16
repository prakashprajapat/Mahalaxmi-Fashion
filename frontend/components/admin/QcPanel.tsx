'use client';
import type { QcIssue } from '@/lib/productQC';

// Inline QC checklist shown at the top of the Add/Edit product form after Save.
// Lists every issue (fail = red, warning = amber). Upload is blocked until all
// fails are cleared. "Re-check" re-runs the save (which re-validates); "Upload
// anyway" only appears when there are warnings but no fails.
export default function QcPanel({
  issues, checking, onRecheck, onForceUpload, onClose,
}: {
  issues: QcIssue[];
  checking: boolean;
  onRecheck: () => void;
  onForceUpload?: () => void;
  onClose: () => void;
}) {
  const fails = issues.filter(i => i.level === 'fail');
  const warns = issues.filter(i => i.level === 'warn');
  const allClear = fails.length === 0 && warns.length === 0;

  return (
    <div style={{
      border: `2px solid ${fails.length ? '#e53935' : allClear ? '#2e7d32' : '#f9a825'}`,
      borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '1.2rem',
      background: fails.length ? '#fff5f5' : allClear ? '#f1f8f2' : '#fffdf3',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: fails.length ? '#c62828' : allClear ? '#2e7d32' : '#f57f17' }}>
          {allClear ? '✅ QC Passed — ready to upload' : fails.length ? `❌ QC Failed — ${fails.length} issue${fails.length > 1 ? 's' : ''} to fix` : `⚠️ QC — ${warns.length} warning${warns.length > 1 ? 's' : ''}`}
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#999' }}>✕</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {fails.map((f, i) => (
          <div key={'f' + i} style={{ display: 'flex', gap: '.5rem', fontSize: '.88rem', color: '#333' }}>
            <span style={{ color: '#e53935', fontWeight: 800 }}>✗</span>
            <span>{f.message}</span>
          </div>
        ))}
        {warns.map((w, i) => (
          <div key={'w' + i} style={{ display: 'flex', gap: '.5rem', fontSize: '.88rem', color: '#333' }}>
            <span style={{ color: '#f9a825', fontWeight: 800 }}>⚠</span>
            <span>{w.message}</span>
          </div>
        ))}
        {allClear && (
          <p style={{ margin: 0, fontSize: '.88rem', color: '#2e7d32' }}>All checks passed — Duplicate Name, Duplicate Photos, Description and SEO are all good.</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.6rem', marginTop: '.9rem', flexWrap: 'wrap' }}>
        <button onClick={onRecheck} disabled={checking}
          style={{ background: '#a7354d', color: '#fff', border: 'none', borderRadius: 8, padding: '.55rem 1.3rem', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', opacity: checking ? .6 : 1 }}>
          {checking ? 'Checking…' : fails.length ? '🔄 Re-check & Upload' : '⬆️ Upload'}
        </button>
        {fails.length === 0 && warns.length > 0 && onForceUpload && (
          <button onClick={onForceUpload}
            style={{ background: '#f57f17', color: '#fff', border: 'none', borderRadius: 8, padding: '.55rem 1.3rem', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer' }}>
            Upload anyway (ignore warnings)
          </button>
        )}
      </div>
      <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#888' }}>
        Fix the highlighted fields above, then click Re-check. The product uploads automatically once QC passes.
      </p>
    </div>
  );
}
