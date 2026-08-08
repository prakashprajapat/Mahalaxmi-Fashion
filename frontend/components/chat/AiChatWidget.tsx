'use client';
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { getCustomer } from '@/lib/auth';

type Msg = { role: 'user' | 'assistant'; content: string };

const BRAND = '#a7354d';
const BRAND_DARK = '#7d1f34';
const GREETING = "Hi! 👋 I'm Laxmi, your shopping assistant at Mahalaxmi Fashion Hub. Ask me about sarees, nighty, delivery, returns, or any product — I'm here to help 😊";

// Turn plain URLs in the bot reply into clickable links.
function renderText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: BRAND, textDecoration: 'underline', wordBreak: 'break-word' }}>{p}</a>
      : <span key={i}>{p}</span>
  );
}

export default function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', content: GREETING }]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<Msg[]>(msgs);
  useEffect(() => { msgsRef.current = msgs; }, [msgs]);
  const notifiedCountRef = useRef(0);

  // Email the whole conversation + the visitor's details to the store owner.
  // Fires once per new batch of customer messages (on close / when leaving the page).
  const notifyOwner = () => {
    const all = msgsRef.current;
    const userCount = all.filter(m => m.role === 'user').length;
    if (userCount === 0 || userCount <= notifiedCountRef.current) return;
    notifiedCountRef.current = userCount;
    const c = getCustomer();
    const payload = {
      customerName: c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : '',
      customerEmail: c?.email ?? '',
      customerPhone: c?.phone ?? '',
      customerCode: c?.customerCode ?? '',
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      messages: all.map(m => ({ role: m.role, content: m.content })),
    };
    try {
      fetch('/api/chat/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch { /* ignore */ }
  };

  useEffect(() => {
    window.addEventListener('pagehide', notifyOwner);
    return () => {
      window.removeEventListener('pagehide', notifyOwner);
      notifyOwner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reliability: also email the owner ~12s after the visitor stops chatting,
  // so the transcript is captured even if they never press the close button.
  useEffect(() => {
    const userCount = msgs.filter(m => m.role === 'user').length;
    if (userCount === 0 || userCount <= notifiedCountRef.current) return;
    const t = setTimeout(() => notifyOwner(), 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, open]);

  // Opened from the combined Help FAB (WhatsApp + chat launcher).
  useEffect(() => {
    const openChat = () => { setOpen(true); trackEvent('chatbot_open'); };
    window.addEventListener('mfh-open-chat', openChat);
    return () => window.removeEventListener('mfh-open-chat', openChat);
  }, []);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    trackEvent('chatbot_message', { length: text.length });
    try {
      const r = await fetch('/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await r.json()) as { reply?: string };
      setMsgs(m => [...m, { role: 'assistant', content: data.reply || 'Sorry, please try again 🙏' }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Connection issue 🙏 Chat with us on WhatsApp: https://wa.me/919429429880' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher lives in the combined Help FAB now — this widget only renders the panel. */}
      {open && (
        <div
          role="dialog"
          aria-label="Chat assistant"
          className="mfh-chat-panel"
          style={{
            position: 'fixed', right: '1.5rem', bottom: '1.5rem', zIndex: 1001,
            width: 360, maxWidth: 'calc(100vw - 2rem)', height: 520, maxHeight: 'calc(100vh - 3rem)',
            background: '#fff', borderRadius: 16, overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column',
          }}>
          {/* Header */}
          <div style={{ background: BRAND, color: '#fff', padding: '.85rem 1rem', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem' }}>L</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '.95rem', lineHeight: 1.1 }}>Laxmi · Shopping Help</div>
              <div style={{ fontSize: '.72rem', opacity: .9 }}>Mahalaxmi Fashion Hub</div>
            </div>
            <button onClick={() => { notifyOwner(); setOpen(false); }} aria-label="Close chat"
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 4 }}>×</button>
          </div>

          {/* Messages */}
          <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '.9rem', background: '#faf6f2', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  padding: '.55rem .75rem', borderRadius: 12, fontSize: '.86rem', lineHeight: 1.4, whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? BRAND : '#fff',
                  color: m.role === 'user' ? '#fff' : '#1a1a1a',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                  borderBottomLeftRadius: m.role === 'user' ? 12 : 4,
                  boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                }}>
                  {m.role === 'assistant' ? renderText(m.content) : m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start' }}>
                <div style={{ padding: '.6rem .8rem', borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.08)', display: 'flex', gap: 4 }}>
                  <span className="mfh-dot" /><span className="mfh-dot" /><span className="mfh-dot" />
                </div>
              </div>
            )}
          </div>

          {/* Quick chips (only before first user message) */}
          {msgs.length === 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', padding: '.5rem .9rem 0' }}>
              {['Delivery time?', 'Return policy?', 'Show best sarees'].map(q => (
                <button key={q} onClick={() => send(q)}
                  style={{ border: `1px solid ${BRAND}`, color: BRAND, background: '#fff', borderRadius: 16, padding: '.3rem .7rem', fontSize: '.76rem', cursor: 'pointer' }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ display: 'flex', gap: '.5rem', padding: '.7rem .8rem', borderTop: '1px solid #eee', background: '#fff' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Type your question..."
              aria-label="Type your message"
              style={{ flex: 1, border: '1.5px solid #e0d5d5', borderRadius: 20, padding: '.55rem .9rem', fontSize: '.86rem', outline: 'none' }}
            />
            <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send"
              style={{ background: input.trim() && !busy ? BRAND : '#ccc', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: input.trim() && !busy ? 'pointer' : 'default', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
            </button>
          </div>

          <div style={{ textAlign: 'center', fontSize: '.68rem', color: '#999', padding: '0 0 .5rem' }}>
            Or <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer" style={{ color: BRAND_DARK, fontWeight: 600 }}>chat on WhatsApp</a>
          </div>

          <style>{`
            @keyframes mfhBlink { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
            .mfh-dot { width:6px;height:6px;border-radius:50%;background:${BRAND};display:inline-block;animation:mfhBlink 1.2s infinite; }
            .mfh-dot:nth-child(2){animation-delay:.2s}
            .mfh-dot:nth-child(3){animation-delay:.4s}
          `}</style>
        </div>
      )}
    </>
  );
}
