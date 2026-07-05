// @ts-nocheck
'use client';
import { useState, useEffect, useCallback } from 'react';
import { getAdminToken } from '@/lib/auth';
const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const SC = { pending:{bg:'#fff8e1',color:'#e65100'}, approved:{bg:'#e8f5e9',color:'#2e7d32'}, rejected:{bg:'#fce4ec',color:'#c62828'} };

export default function InfluencersAdminPage() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editComm, setEditComm] = useState('');
  const [editDisc, setEditDisc] = useState('10');
  const [editNotes, setEditNotes] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);
  // Performance report / analytics
  const [view, setView] = useState('apps');         // 'apps' | 'report'
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [rSort, setRSort] = useState('totalSales');
  const [rDir, setRDir] = useState('desc');
  // Fraud & misuse
  const [fraud, setFraud] = useState(null);
  const [fraudLoading, setFraudLoading] = useState(false);
  const [fraudCreator, setFraudCreator] = useState('all');
  const [fraudFlag, setFraudFlag] = useState('all'); // all | self | flagged | returned | cancelled

  const token = typeof window !== 'undefined' ? getAdminToken() : '';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/influencers?status=${filter}`, { headers });
      if (res.ok) setList(await res.json());
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await fetch(`${API}/api/influencers/report`, { headers });
      if (res.ok) setReport(await res.json());
    } finally { setReportLoading(false); }
  }, []);

  useEffect(() => { loadReport(); }, [loadReport]);

  const loadFraud = useCallback(async () => {
    setFraudLoading(true);
    try {
      const res = await fetch(`${API}/api/influencers/fraud-report`, { headers });
      if (res.ok) setFraud(await res.json());
    } finally { setFraudLoading(false); }
  }, []);

  useEffect(() => { if (view === 'fraud' && !fraud) loadFraud(); }, [view, fraud, loadFraud]);

  const downloadFraudCsv = () => {
    if (!fraud) return;
    const list = fraudCreator !== 'all' ? fraud.creators.filter(c => String(c.id) === fraudCreator) : fraud.creators;
    const rows = [['Creator','Coupon','Order ID','Customer','Phone','Amount','Status','Date','Flags']];
    list.forEach(c => c.orders.filter(o =>
      fraudFlag === 'all' ? true
      : fraudFlag === 'flagged' ? o.flags.length > 0
      : fraudFlag === 'self' ? o.flags.some((f: string) => f.startsWith('Self'))
      : fraudFlag === 'returned' ? o.flags.includes('Returned')
      : fraudFlag === 'cancelled' ? o.flags.includes('Cancelled')
      : true
    ).forEach(o => {
      rows.push([c.name, c.couponCode ?? '', o.orderId, o.customerName, o.customerPhone, o.total, o.status, o.date, o.flags.join(' | ')]);
    }));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const who = fraudCreator !== 'all' ? String(list[0]?.name || 'creator').replace(/[^a-z0-9]+/gi,'-') : 'all-creators';
    a.href = url; a.download = `${who}-order-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const toggleSort = (key) => {
    if (rSort === key) setRDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setRSort(key); setRDir('desc'); }
  };

  const sortedCreators = report
    ? [...report.creators].sort((a, b) => {
        const av = Number(a[rSort] ?? 0), bv = Number(b[rSort] ?? 0);
        return rDir === 'desc' ? bv - av : av - bv;
      })
    : [];

  const downloadCsv = () => {
    if (!report) return;
    const rows = [['Creator','Email','Platform','Coupon','Status','Commission Rate %','Orders','Returns','Return %','Sales','Net Sales','Commission (net)','AOV']];
    report.creators.forEach(c => rows.push([c.name, c.email, c.platform, c.couponCode ?? '', c.status, c.commissionRate, c.totalOrders, c.returnedOrders, c.returnRate, c.totalSales, c.netSales, c.netCommission, c.avgOrderValue]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `creator-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Per-creator order-level report (Order ID, Amount, Commission, Status, Date) → CSV/Excel.
  const downloadCreatorReport = () => {
    if (!selected || !stats) return;
    const rate = Number(selected.commissionRate) || 0;
    const rows = [
      [`Creator: ${selected.name}`, `Coupon: ${selected.couponCode ?? '-'}`, `Rate: ${rate}%`],
      [],
      ['Order ID', 'Amount', 'Commission', 'Status', 'Date'],
    ];
    stats.orders.forEach(o => {
      rows.push([o.orderId, o.total, Math.round(o.total * rate) / 100, o.status, o.placedAt]);
    });
    rows.push([]);
    rows.push(['TOTAL', stats.totalSales, stats.commissionEarned, `${stats.totalOrders} orders`, '']);
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(selected.name).replace(/[^a-z0-9]+/gi, '-')}-orders-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const openDetail = async (inf) => {
    setSelected(inf); setEditStatus(inf.status); setEditCode(inf.couponCode??'');
    setEditComm(String(inf.commissionRate)); setEditNotes(inf.adminNotes??''); setEditPassword(''); setStats(null); setStatsLoading(true);
    try {
      const res = await fetch(`${API}/api/influencers/${inf.id}/stats`, { headers });
      if (res.ok) setStats(await res.json());
    } finally { setStatsLoading(false); }
  };

  const save = async () => {
    if (!selected) return; setSaving(true);
    try {
      const cappedComm = Math.min(parseFloat(editComm) || 3, 3);
      await fetch(`${API}/api/influencers/${selected.id}`, { method:'PUT', headers, body:JSON.stringify({ status:editStatus, couponCode:editCode||null, commissionRate:cappedComm, couponDiscountPct:parseFloat(editDisc)||10, adminNotes:editNotes||null, newPassword:editPassword||null }) });
      await load();
      loadReport();
      setEditPassword('');
      setSelected({...selected, status:editStatus, couponCode:editCode||undefined, commissionRate:cappedComm, resetRequestedAt: editPassword ? null : selected.resetRequestedAt});
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this influencer?')) return;
    await fetch(`${API}/api/influencers/${id}`, { method:'DELETE', headers });
    setSelected(null); load();
  };

  const genCode = (name) => {
    const c = name.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5);
    setEditCode(c + Math.random().toString(36).slice(2,5).toUpperCase());
  };

  const pending = list.filter(i => i.status==='pending').length;

  return (
    <div style={{padding:'1.5rem',maxWidth:'1100px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'1rem',marginBottom:'1.5rem'}}>
        <div>
          <h2 style={{margin:0,fontWeight:800}}>Influencer Marketing</h2>
          <p style={{margin:'.25rem 0 0',color:'#777',fontSize:'.85rem'}}>Manage applications, coupon codes & commissions</p>
        </div>
        <a href="/influencer" target="_blank" style={{background:'#a7354d',color:'#fff',padding:'.5rem 1rem',borderRadius:'8px',textDecoration:'none',fontSize:'.85rem',fontWeight:600}}>
          🔗 View Apply Page
        </a>
      </div>

      <div style={{display:'flex',gap:'.5rem',marginBottom:'1.25rem'}}>
        {[['apps','📋 Applications'],['report','📊 Performance Report'],['fraud','📋 Influencer Order Report']].map(([v,label]) => (
          <button key={v} onClick={()=>setView(v)} style={{padding:'.5rem 1.1rem',borderRadius:'10px',border:'none',cursor:'pointer',fontWeight:700,fontSize:'.85rem',background:view===v?'#a7354d':'#f0f0f0',color:view===v?'#fff':'#555'}}>{label}</button>
        ))}
      </div>

      {view === 'apps' && (<>
      <div style={{display:'flex',gap:'1rem',marginBottom:'1.5rem',flexWrap:'wrap'}}>
        {[['Total',list.length,'#6366f1'],['Pending',pending,'#f59e0b'],['Approved',list.filter(i=>i.status==='approved').length,'#22c55e'],['Rejected',list.filter(i=>i.status==='rejected').length,'#ef4444']].map(([label,count,color]) => (
          <div key={label} style={{flex:'1 1 100px',background:'#fff',borderRadius:'12px',padding:'1rem',boxShadow:'0 1px 6px rgba(0,0,0,.08)',borderLeft:`4px solid ${color}`}}>
            <div style={{fontSize:'1.5rem',fontWeight:800,color}}>{count}</div>
            <div style={{fontSize:'.8rem',color:'#888',fontWeight:600}}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem'}}>
        {['all','pending','approved','rejected'].map(s => (
          <button key={s} onClick={()=>setFilter(s)} style={{padding:'.35rem .9rem',borderRadius:'20px',border:'none',cursor:'pointer',fontWeight:600,fontSize:'.82rem',textTransform:'capitalize',background:filter===s?'#a7354d':'#f0f0f0',color:filter===s?'#fff':'#555'}}>
            {s}{s==='pending'&&pending>0?` (${pending})`:''}
          </button>
        ))}
      </div>

      <div style={{background:'#fff',borderRadius:'12px',boxShadow:'0 1px 6px rgba(0,0,0,.08)',overflow:'hidden'}}>
        {loading ? <div style={{padding:'3rem',textAlign:'center',color:'#999'}}>Loading...</div>
        : list.length===0 ? <div style={{padding:'3rem',textAlign:'center',color:'#999'}}>No influencers found.</div>
        : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}}>
              <thead>
                <tr style={{background:'#fdf0f3',borderBottom:'2px solid #f0d0d8'}}>
                  {['Name','Platform / Handle','Followers','Category','Status','Coupon','Applied','Action'].map(h=>(
                    <th key={h} style={{padding:'.75rem 1rem',textAlign:'left',fontWeight:700,color:'#555',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((inf,i) => {
                  const sc = SC[inf.status] ?? SC.pending;
                  return (
                    <tr key={inf.id} style={{borderBottom:'1px solid #f5f5f5',background:i%2===0?'#fff':'#fafafa'}}>
                      <td style={{padding:'.7rem 1rem',fontWeight:600}}>
                        <div>{inf.name}</div><div style={{fontSize:'.75rem',color:'#888'}}>{inf.email}</div>
                        {inf.resetRequestedAt && <div style={{marginTop:'.3rem',display:'inline-block',background:'#fff3e0',color:'#e65100',fontSize:'.68rem',fontWeight:700,padding:'.12rem .5rem',borderRadius:'10px'}}>🔔 Password reset requested</div>}
                      </td>
                      <td style={{padding:'.7rem 1rem'}}><div style={{fontWeight:600}}>{inf.platform}</div><div style={{fontSize:'.75rem',color:'#888'}}>{inf.socialHandle??'—'}</div></td>
                      <td style={{padding:'.7rem 1rem',color:'#555'}}>{inf.followersCount??'—'}</td>
                      <td style={{padding:'.7rem 1rem',color:'#555'}}>{inf.category??'—'}</td>
                      <td style={{padding:'.7rem 1rem'}}>
                        <span style={{background:sc.bg,color:sc.color,padding:'.2rem .6rem',borderRadius:'20px',fontWeight:700,fontSize:'.75rem',textTransform:'capitalize'}}>{inf.status}</span>
                      </td>
                      <td style={{padding:'.7rem 1rem'}}>
                        {inf.couponCode ? <code style={{background:'#f0f0f0',padding:'.1rem .4rem',borderRadius:'4px',fontSize:'.8rem',fontWeight:700,color:'#a7354d'}}>{inf.couponCode}</code> : <span style={{color:'#bbb'}}>—</span>}
                      </td>
                      <td style={{padding:'.7rem 1rem',color:'#888',whiteSpace:'nowrap'}}>{new Date(inf.createdAt).toLocaleDateString('en-IN')}</td>
                      <td style={{padding:'.7rem 1rem'}}>
                        <button onClick={()=>openDetail(inf)} style={{padding:'.3rem .7rem',borderRadius:'6px',border:'1.5px solid #a7354d',background:'#fff',color:'#a7354d',cursor:'pointer',fontWeight:600,fontSize:'.78rem'}}>Manage</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {view === 'report' && (
        reportLoading || !report
        ? <div style={{padding:'3rem',textAlign:'center',color:'#999'}}>Loading report…</div>
        : (
        <div>
          <div style={{display:'flex',gap:'1rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
            {[['Total Orders',report.totals.totalOrders,'#6366f1'],['Revenue (Sales)',`₹${report.totals.totalSales.toLocaleString('en-IN')}`,'#22c55e'],['Commission Owed',`₹${report.totals.netCommission.toLocaleString('en-IN')}`,'#a7354d'],['Returns',`${report.totals.totalReturns} (${report.totals.returnRate}%)`,'#ef4444'],['Active Creators',report.totals.activeWithCode,'#0ea5e9']].map(([label,val,color]) => (
              <div key={label} style={{flex:'1 1 140px',background:'#fff',borderRadius:'12px',padding:'1rem',boxShadow:'0 1px 6px rgba(0,0,0,.08)',borderLeft:`4px solid ${color}`}}>
                <div style={{fontSize:'1.4rem',fontWeight:800,color}}>{val}</div>
                <div style={{fontSize:'.8rem',color:'#888',fontWeight:600}}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem',flexWrap:'wrap',gap:'.5rem'}}>
            <h3 style={{margin:0,fontWeight:700,fontSize:'1rem'}}>Creator Performance <span style={{fontWeight:400,color:'#999',fontSize:'.8rem'}}>(click a column to sort)</span></h3>
            <button onClick={downloadCsv} style={{padding:'.4rem .9rem',borderRadius:'8px',border:'1.5px solid #a7354d',background:'#fff',color:'#a7354d',cursor:'pointer',fontWeight:600,fontSize:'.82rem'}}>⬇ Download CSV</button>
          </div>

          <div style={{background:'#fff',borderRadius:'12px',boxShadow:'0 1px 6px rgba(0,0,0,.08)',overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}}>
              <thead>
                <tr style={{background:'#fdf0f3',borderBottom:'2px solid #f0d0d8'}}>
                  <th style={{padding:'.7rem 1rem',textAlign:'left',fontWeight:700,color:'#555'}}>#</th>
                  <th style={{padding:'.7rem 1rem',textAlign:'left',fontWeight:700,color:'#555'}}>Creator</th>
                  <th style={{padding:'.7rem 1rem',textAlign:'left',fontWeight:700,color:'#555'}}>Coupon</th>
                  <th style={{padding:'.7rem 1rem',textAlign:'left',fontWeight:700,color:'#555'}}>Status</th>
                  {[['commissionRate','Rate'],['totalOrders','Orders'],['returnedOrders','Returns'],['returnRate','Return %'],['totalSales','Sales'],['netCommission','Commission'],['avgOrderValue','AOV']].map(([key,label]) => (
                    <th key={key} onClick={()=>toggleSort(key)} style={{padding:'.7rem 1rem',textAlign:'right',fontWeight:700,color:'#555',cursor:'pointer',whiteSpace:'nowrap',userSelect:'none'}}>
                      {label}{rSort===key?(rDir==='desc'?' ▼':' ▲'):''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCreators.length===0 ? (
                  <tr><td colSpan={11} style={{padding:'2.5rem',textAlign:'center',color:'#999'}}>No creators yet.</td></tr>
                ) : sortedCreators.map((c,i) => {
                  const sc = SC[c.status] ?? SC.pending;
                  return (
                    <tr key={c.id} style={{borderBottom:'1px solid #f5f5f5',background:i%2===0?'#fff':'#fafafa'}}>
                      <td style={{padding:'.6rem 1rem',color:'#999',fontWeight:700}}>{i+1}</td>
                      <td style={{padding:'.6rem 1rem',fontWeight:600}}><div>{c.name}</div><div style={{fontSize:'.73rem',color:'#999'}}>{c.platform}</div></td>
                      <td style={{padding:'.6rem 1rem'}}>{c.couponCode?<code style={{background:'#f0f0f0',padding:'.1rem .4rem',borderRadius:'4px',color:'#a7354d',fontWeight:700}}>{c.couponCode}</code>:<span style={{color:'#bbb'}}>—</span>}</td>
                      <td style={{padding:'.6rem 1rem'}}><span style={{background:sc.bg,color:sc.color,padding:'.15rem .55rem',borderRadius:'20px',fontWeight:700,fontSize:'.72rem',textTransform:'capitalize'}}>{c.status}</span></td>
                      <td style={{padding:'.6rem 1rem',textAlign:'right',color:'#555'}}>{c.commissionRate}%</td>
                      <td style={{padding:'.6rem 1rem',textAlign:'right',fontWeight:700}}>{c.totalOrders}</td>
                      <td style={{padding:'.6rem 1rem',textAlign:'right',color:c.returnedOrders>0?'#ef4444':'#999',fontWeight:600}}>{c.returnedOrders}</td>
                      <td style={{padding:'.6rem 1rem',textAlign:'right',color:c.returnRate>0?'#ef4444':'#999'}}>{c.returnRate}%</td>
                      <td style={{padding:'.6rem 1rem',textAlign:'right',color:'#16a34a',fontWeight:700}}>₹{c.totalSales.toLocaleString('en-IN')}</td>
                      <td style={{padding:'.6rem 1rem',textAlign:'right',color:'#a7354d',fontWeight:700}}>₹{c.netCommission.toLocaleString('en-IN')}</td>
                      <td style={{padding:'.6rem 1rem',textAlign:'right',color:'#777'}}>₹{c.avgOrderValue.toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{fontSize:'.78rem',color:'#999',marginTop:'.75rem'}}>Returns count orders in status Return Requested / Return Transit / Return. Commission shown is on <b>net</b> sales (returns excluded) — this is what you actually owe. AOV = average order value. Cancelled orders are excluded everywhere.</p>
        </div>
        )
      )}

      {view === 'fraud' && (
        fraudLoading || !fraud
        ? <div style={{padding:'3rem',textAlign:'center',color:'#999'}}>Loading report…</div>
        : (() => {
          const sel = fraudCreator !== 'all' ? fraud.creators.find(c => String(c.id) === fraudCreator) : null;
          const allOrders = sel
            ? sel.orders.map(o => ({ ...o, creatorName: sel.name }))
            : fraud.creators.flatMap(c => c.orders.map(o => ({ ...o, creatorName: c.name })));
          const orders = allOrders.filter(o =>
            fraudFlag === 'all' ? true
            : fraudFlag === 'flagged' ? o.flags.length > 0
            : fraudFlag === 'self' ? o.flags.some((f: string) => f.startsWith('Self'))
            : fraudFlag === 'returned' ? o.flags.includes('Returned')
            : fraudFlag === 'cancelled' ? o.flags.includes('Cancelled')
            : true);
          const rc = sel ? (sel.risk==='high'?{bg:'#fef2f2',txt:'#b91c1c',label:'🔴 High risk'}:sel.risk==='medium'?{bg:'#fffbeb',txt:'#b45309',label:'🟡 Medium'}:{bg:'#f0fdf4',txt:'#15803d',label:'🟢 Low'}) : null;
          return (
          <div>
            <div style={{display:'flex',gap:'1rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
              {[['Total Creators',fraud.totals.creators,'#6366f1'],['Flagged Orders',fraud.totals.flaggedOrders,'#f59e0b'],['Self-orders',fraud.totals.selfOrders,'#a7354d'],['High-risk',fraud.totals.highRisk,'#ef4444']].map(([label,val,color]) => (
                <div key={label} style={{flex:'1 1 140px',background:'#fff',borderRadius:'12px',padding:'1rem',boxShadow:'0 1px 6px rgba(0,0,0,.08)',borderLeft:`4px solid ${color}`}}>
                  <div style={{fontSize:'1.4rem',fontWeight:800,color}}>{val}</div>
                  <div style={{fontSize:'.8rem',color:'#888',fontWeight:600}}>{label}</div>
                </div>
              ))}
            </div>

            {/* Filter + Export */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.75rem',marginBottom:'1rem',flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
                <label style={{fontSize:'.82rem',fontWeight:600,color:'#555'}}>Creator:</label>
                <select value={fraudCreator} onChange={e=>setFraudCreator(e.target.value)}
                  style={{padding:'.45rem .8rem',borderRadius:'8px',border:'1.5px solid #ddd',fontSize:'.85rem',minWidth:'230px',background:'#fff'}}>
                  <option value="all">All creators</option>
                  {fraud.creators.map(c => <option key={c.id} value={String(c.id)}>{c.name} ({c.couponCode})</option>)}
                </select>
                <label style={{fontSize:'.82rem',fontWeight:600,color:'#555',marginLeft:'.5rem'}}>Show:</label>
                <select value={fraudFlag} onChange={e=>setFraudFlag(e.target.value)}
                  style={{padding:'.45rem .8rem',borderRadius:'8px',border:'1.5px solid #ddd',fontSize:'.85rem',background:'#fff'}}>
                  <option value="all">All orders</option>
                  <option value="self">🚩 Self-orders</option>
                  <option value="flagged">Flagged only</option>
                  <option value="returned">Returned</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <button onClick={downloadFraudCsv} style={{padding:'.45rem 1rem',borderRadius:'8px',border:'none',background:'#16a34a',color:'#fff',cursor:'pointer',fontWeight:700,fontSize:'.83rem'}}>⬇ Export to Excel</button>
            </div>

            {sel && rc && (
              <div style={{background:'#fff',borderRadius:'12px',boxShadow:'0 1px 6px rgba(0,0,0,.08)',padding:'.9rem 1rem',marginBottom:'.75rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'.5rem'}}>
                <div>
                  <div style={{fontWeight:700}}>{sel.name} <code style={{background:'#f0f0f0',padding:'.1rem .4rem',borderRadius:'4px',color:'#a7354d',fontSize:'.78rem'}}>{sel.couponCode}</code></div>
                  <div style={{fontSize:'.78rem',color:'#777',marginTop:'.2rem'}}>Orders {sel.totalOrders} · Returns {sel.returnedOrders} ({sel.returnRate}%) · Cancels {sel.cancelledOrders} ({sel.cancelRate}%) · Self-orders {sel.selfOrders} · Repeat customers {sel.repeatCustomers}</div>
                </div>
                <span style={{background:rc.bg,color:rc.txt,padding:'.25rem .7rem',borderRadius:'20px',fontWeight:700,fontSize:'.78rem',whiteSpace:'nowrap'}}>{rc.label}</span>
              </div>
            )}

            <div style={{background:'#fff',borderRadius:'12px',boxShadow:'0 1px 6px rgba(0,0,0,.08)',overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.82rem'}}>
                <thead><tr style={{background:'#fdf0f3',borderBottom:'2px solid #f0d0d8'}}>
                  {['Creator','Order ID','Customer','Phone','Amount','Status','Date','Flags'].map(h=>(
                    <th key={h} style={{padding:'.6rem .7rem',textAlign:'left',fontWeight:700,color:'#555',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {orders.length===0 ? (
                    <tr><td colSpan={8} style={{padding:'2.5rem',textAlign:'center',color:'#999'}}>No orders yet.</td></tr>
                  ) : orders.map((o,i)=>{
                    const flagged=o.flags.length>0;
                    return (
                    <tr key={o.orderId+'-'+i} style={{borderBottom:'1px solid #f5f5f5',background:flagged?'#fffdf5':(i%2===0?'#fff':'#fafafa')}}>
                      <td style={{padding:'.5rem .7rem',fontWeight:600,whiteSpace:'nowrap'}}>{o.creatorName}</td>
                      <td style={{padding:'.5rem .7rem',fontWeight:600,color:'#a7354d',whiteSpace:'nowrap'}}>{o.orderId}</td>
                      <td style={{padding:'.5rem .7rem'}}>{o.customerName||'—'}</td>
                      <td style={{padding:'.5rem .7rem',whiteSpace:'nowrap'}}>{o.customerPhone||'—'}</td>
                      <td style={{padding:'.5rem .7rem'}}>₹{o.total.toLocaleString('en-IN')}</td>
                      <td style={{padding:'.5rem .7rem'}}>{o.status}</td>
                      <td style={{padding:'.5rem .7rem',whiteSpace:'nowrap',color:'#888'}}>{o.date}</td>
                      <td style={{padding:'.5rem .7rem'}}>
                        {o.flags.length===0?<span style={{color:'#bbb'}}>—</span>:o.flags.map(f=>(
                          <span key={f} style={{display:'inline-block',background:f.startsWith('Self')?'#fee2e2':f==='Returned'?'#fef3c7':f==='Cancelled'?'#e5e7eb':'#e0e7ff',color:f.startsWith('Self')?'#b91c1c':f==='Returned'?'#b45309':f==='Cancelled'?'#374151':'#3730a3',padding:'.1rem .45rem',borderRadius:'8px',fontSize:'.7rem',fontWeight:700,marginRight:'.25rem'}}>{f}</span>
                        ))}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
            <p style={{fontSize:'.78rem',color:'#999',marginTop:'.75rem'}}>Select a creator to view only their orders, then Export to Excel. <b>Self-order</b> = the customer&apos;s phone/email matches the creator&apos;s own. <b>Repeat</b> = the same phone appears across many orders. A high return/cancel rate or many self-orders can indicate coupon misuse — review before paying commission.</p>
          </div>
          );
        })()
      )}

      {selected && (
        <div style={{position:'fixed',inset:0,zIndex:500,display:'flex'}}>
          <div style={{flex:1,background:'rgba(0,0,0,.5)'}} onClick={()=>setSelected(null)} />
          <div style={{width:'min(500px,100vw)',background:'#fff',overflowY:'auto',boxShadow:'-4px 0 24px rgba(0,0,0,.15)',padding:'1.5rem',display:'flex',flexDirection:'column',gap:'1.25rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3 style={{margin:0,fontWeight:800,fontSize:'1.1rem'}}>{selected.name}</h3>
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',fontSize:'1.3rem',cursor:'pointer',color:'#888'}}>✕</button>
            </div>
            <div style={{background:'#fdf8f9',borderRadius:'12px',padding:'1rem',fontSize:'.85rem',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem'}}>
              {[['Email',selected.email],['Phone',selected.phone??'—'],['Platform',selected.platform],['Handle',selected.socialHandle??'—'],['Followers',selected.followersCount??'—'],['Category',selected.category??'—']].map(([k,v])=>(
                <div key={k}><div style={{color:'#999',fontSize:'.73rem',fontWeight:600}}>{k}</div><div style={{fontWeight:600,wordBreak:'break-all'}}>{v}</div></div>
              ))}
              {selected.niche && <div style={{gridColumn:'1/-1'}}><div style={{color:'#999',fontSize:'.73rem',fontWeight:600}}>About</div><div style={{color:'#555'}}>{selected.niche}</div></div>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'.75rem'}}>
              <div>
                <label style={{fontWeight:700,fontSize:'.82rem',display:'block',marginBottom:'.3rem'}}>Status</label>
                <select value={editStatus} onChange={e=>setEditStatus(e.target.value)} style={{width:'100%',padding:'.55rem .75rem',borderRadius:'8px',border:'1.5px solid #ddd',fontSize:'.88rem'}}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label style={{fontWeight:700,fontSize:'.82rem',display:'block',marginBottom:'.3rem'}}>Coupon Code</label>
                <div style={{display:'flex',gap:'.5rem'}}>
                  <input value={editCode} onChange={e=>setEditCode(e.target.value.toUpperCase())} placeholder="e.g. RIYA15" style={{flex:1,padding:'.55rem .75rem',borderRadius:'8px',border:'1.5px solid #ddd',fontSize:'.88rem',fontFamily:'monospace'}} />
                  <button onClick={()=>genCode(selected.name)} style={{padding:'.55rem .75rem',borderRadius:'8px',border:'1.5px solid #ddd',background:'#f5f5f5',cursor:'pointer',fontSize:'.8rem'}}>Auto</button>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem'}}>
                <div><label style={{fontWeight:700,fontSize:'.82rem',display:'block',marginBottom:'.3rem'}}>Commission % (you pay) <span style={{fontWeight:400,color:'#888'}}>(max 3%)</span></label>
                  <input type="number" value={editComm} onChange={e=>{ const n=parseFloat(e.target.value); setEditComm(isNaN(n)?e.target.value:String(Math.min(n,3))); }} min="0" max="3" step="0.5" style={{width:'100%',padding:'.55rem .75rem',borderRadius:'8px',border:'1.5px solid #ddd',fontSize:'.88rem',boxSizing:'border-box'}} />
                </div>
                <div><label style={{fontWeight:700,fontSize:'.82rem',display:'block',marginBottom:'.3rem'}}>Coupon Discount %</label>
                  <input type="number" value={editDisc} onChange={e=>setEditDisc(e.target.value)} min="0" max="50" step="1" style={{width:'100%',padding:'.55rem .75rem',borderRadius:'8px',border:'1.5px solid #ddd',fontSize:'.88rem',boxSizing:'border-box'}} />
                </div>
              </div>
              <div><label style={{fontWeight:700,fontSize:'.82rem',display:'block',marginBottom:'.3rem'}}>Admin Notes</label>
                <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} rows={2} placeholder="Internal notes..." style={{width:'100%',padding:'.55rem .75rem',borderRadius:'8px',border:'1.5px solid #ddd',fontSize:'.85rem',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}} />
              </div>
              <div><label style={{fontWeight:700,fontSize:'.82rem',display:'block',marginBottom:'.3rem'}}>Set / Reset Login Password <span style={{fontWeight:400,color:'#888'}}>(leave blank to keep)</span></label>
                {selected.resetRequestedAt && <div style={{background:'#fff3e0',color:'#e65100',fontSize:'.78rem',fontWeight:600,padding:'.5rem .7rem',borderRadius:'8px',marginBottom:'.5rem'}}>🔔 This creator requested a password reset. Set a new password below and share it with them.</div>}
                <input type="text" value={editPassword} onChange={e=>setEditPassword(e.target.value)} placeholder="New password for this creator" style={{width:'100%',padding:'.55rem .75rem',borderRadius:'8px',border:'1.5px solid #ddd',fontSize:'.88rem',boxSizing:'border-box'}} />
                <p style={{fontSize:'.72rem',color:'#999',margin:'.3rem 0 0'}}>The creator logs in with their email + this password. Share it with them securely.</p>
              </div>
              <div style={{display:'flex',gap:'.5rem'}}>
                <button onClick={save} disabled={saving} style={{flex:1,padding:'.65rem',borderRadius:'8px',border:'none',background:saving?'#ccc':'#a7354d',color:'#fff',fontWeight:700,cursor:saving?'not-allowed':'pointer'}}>
                  {saving ? 'Saving...' : '💾 Save'}
                </button>
                <button onClick={()=>remove(selected.id)} style={{padding:'.65rem 1rem',borderRadius:'8px',border:'1.5px solid #ef4444',background:'#fff',color:'#ef4444',fontWeight:700,cursor:'pointer'}}>🗑️</button>
              </div>
            </div>
            <div style={{borderTop:'1.5px solid #f0f0f0',paddingTop:'1rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
                <h4 style={{margin:0,fontWeight:700}}>Order Report</h4>
                {stats && stats.orders.length>0 && (
                  <button onClick={downloadCreatorReport} style={{padding:'.35rem .8rem',borderRadius:'8px',border:'1.5px solid #16a34a',background:'#fff',color:'#16a34a',cursor:'pointer',fontWeight:700,fontSize:'.78rem'}}>⬇ Export to Excel</button>
                )}
              </div>
              {statsLoading ? <p style={{color:'#999',fontSize:'.85rem'}}>Loading stats...</p>
              : !stats ? <p style={{color:'#bbb',fontSize:'.85rem'}}>No coupon code assigned yet.</p>
              : (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.5rem',marginBottom:'1rem'}}>
                    {[['Orders',stats.totalOrders,'#6366f1'],['Sales',`₹${stats.totalSales.toLocaleString('en-IN')}`,'#22c55e'],['Commission',`₹${stats.commissionEarned.toLocaleString('en-IN')}`,'#a7354d']].map(([label,val,color])=>(
                      <div key={label} style={{background:'#fafafa',borderRadius:'10px',padding:'.75rem',textAlign:'center',borderTop:`3px solid ${color}`}}>
                        <div style={{fontSize:'1.1rem',fontWeight:800,color}}>{val}</div>
                        <div style={{fontSize:'.72rem',color:'#888',fontWeight:600}}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {stats.orders.length>0 ? (
                    <div style={{maxHeight:'260px',overflowY:'auto',borderRadius:'8px',border:'1px solid #f0f0f0'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.78rem'}}>
                        <thead>
                          <tr style={{background:'#fdf0f3'}}>
                            {['Order ID','Amount','Commission','Status','Date'].map(h=>(
                              <th key={h} style={{padding:'.5rem .6rem',textAlign:(h==='Order ID'||h==='Status')?'left':'right',fontWeight:700,color:'#666',whiteSpace:'nowrap',position:'sticky',top:0,background:'#fdf0f3'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stats.orders.map(o=>(
                            <tr key={o.orderId} style={{borderBottom:'1px solid #f5f5f5'}}>
                              <td style={{padding:'.45rem .6rem',fontWeight:600,color:'#a7354d',whiteSpace:'nowrap'}}>{o.orderId}</td>
                              <td style={{padding:'.45rem .6rem',textAlign:'right',color:'#555'}}>₹{o.total.toLocaleString('en-IN')}</td>
                              <td style={{padding:'.45rem .6rem',textAlign:'right',color:'#16a34a',fontWeight:600}}>₹{(o.total*(Number(selected.commissionRate)||0)/100).toFixed(2)}</td>
                              <td style={{padding:'.45rem .6rem',color:'#666'}}>{o.status}</td>
                              <td style={{padding:'.45rem .6rem',textAlign:'right',color:'#888',whiteSpace:'nowrap'}}>{o.placedAt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{color:'#bbb',fontSize:'.83rem',textAlign:'center',padding:'1rem'}}>No orders yet for this creator.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
