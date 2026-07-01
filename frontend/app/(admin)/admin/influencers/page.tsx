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
  const [saving, setSaving] = useState(false);
  // Performance report / analytics
  const [view, setView] = useState('apps');         // 'apps' | 'report'
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [rSort, setRSort] = useState('totalSales');
  const [rDir, setRDir] = useState('desc');

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

  const openDetail = async (inf) => {
    setSelected(inf); setEditStatus(inf.status); setEditCode(inf.couponCode??'');
    setEditComm(String(inf.commissionRate)); setEditNotes(inf.adminNotes??''); setStats(null); setStatsLoading(true);
    try {
      const res = await fetch(`${API}/api/influencers/${inf.id}/stats`, { headers });
      if (res.ok) setStats(await res.json());
    } finally { setStatsLoading(false); }
  };

  const save = async () => {
    if (!selected) return; setSaving(true);
    try {
      const cappedComm = Math.min(parseFloat(editComm) || 3, 3);
      await fetch(`${API}/api/influencers/${selected.id}`, { method:'PUT', headers, body:JSON.stringify({ status:editStatus, couponCode:editCode||null, commissionRate:cappedComm, couponDiscountPct:parseFloat(editDisc)||10, adminNotes:editNotes||null }) });
      await load();
      loadReport();
      setSelected({...selected, status:editStatus, couponCode:editCode||undefined, commissionRate:cappedComm});
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
        {[['apps','📋 Applications'],['report','📊 Performance Report']].map(([v,label]) => (
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
              <div style={{display:'flex',gap:'.5rem'}}>
                <button onClick={save} disabled={saving} style={{flex:1,padding:'.65rem',borderRadius:'8px',border:'none',background:saving?'#ccc':'#a7354d',color:'#fff',fontWeight:700,cursor:saving?'not-allowed':'pointer'}}>
                  {saving ? 'Saving...' : '💾 Save'}
                </button>
                <button onClick={()=>remove(selected.id)} style={{padding:'.65rem 1rem',borderRadius:'8px',border:'1.5px solid #ef4444',background:'#fff',color:'#ef4444',fontWeight:700,cursor:'pointer'}}>🗑️</button>
              </div>
            </div>
            <div style={{borderTop:'1.5px solid #f0f0f0',paddingTop:'1rem'}}>
              <h4 style={{margin:'0 0 .75rem',fontWeight:700}}>Performance Stats</h4>
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
                  {stats.orders.length>0 && (
                    <div style={{maxHeight:'200px',overflowY:'auto',borderRadius:'8px',border:'1px solid #f0f0f0'}}>
                      {stats.orders.map(o=>(
                        <div key={o.orderId} style={{display:'flex',justifyContent:'space-between',padding:'.5rem .75rem',borderBottom:'1px solid #f5f5f5',fontSize:'.8rem'}}>
                          <span style={{fontWeight:600,color:'#a7354d'}}>{o.orderId}</span>
                          <span style={{color:'#555'}}>₹{o.total.toLocaleString('en-IN')}</span>
                          <span style={{color:'#888'}}>{o.placedAt}</span>
                        </div>
                      ))}
                    </div>
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
