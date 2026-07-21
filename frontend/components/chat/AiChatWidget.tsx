'use client';
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';

type Msg = { role: 'user' | 'assistant'; content: string };

const BRAND = '#a7354d';
const BRAND_DARK = '#7d1f34';
const GREETING = 'Namaste! 🙏 Main Laxmi hoon, Mahalaxmi Fashion Hub ki shopping assistant. Sarees, nighty, delivery, return ya kisi bhi product ke baare me poochho — main help karti hoon 😊';

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

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, open]);

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
      setMsgs(m => [...m, { role: 'assistant', content: data.reply || 'Maaf kijiye, dobara try karein 🙏' }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Connection issue 🙏 WhatsApp par baat karein: https://wa.me/919429429880' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher button — sits just above the WhatsApp float */}
      {!open && (
        <button
          onClick={() => { setOpen(true); trackEvent('chatbot_open'); }}
          aria-label="Chat with us"
          style={{
            position: 'fixed', right: '1.5rem', bottom: '5.5rem', zIndex: 999,
            width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: BRAND, color: '#fff', boxShadow: '0 4px 16px rgba(167,53,77,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </button>
      )}

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
            <button onClick={() => setOpen(false)} aria-label="Close chat"
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
              {['Delivery kitne din?', 'Return policy?', 'Best sarees dikhao'].map(q => (
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
              placeholder="Apna sawaal likhein..."
              aria-label="Type your message"
              style={{ flex: 1, border: '1.5px solid #e0d5d5', borderRadius: 20, padding: '.55rem .9rem', fontSize: '.86rem', outline: 'none' }}
            />
            <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send"
              style={{ background: input.trim() && !busy ? BRAND : '#ccc', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: input.trim() && !busy ? 'pointer' : 'default', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
            </button>
          </div>

          <div style={{ textAlign: 'center', fontSize: '.68rem', color: '#999', padding: '0 0 .5rem' }}>
            Ya <a href="https://wa.me/919429429880" target="_blank" rel="noopener noreferrer" style={{ color: BRAND_DARK, fontWeight: 600 }}>WhatsApp par baat karein</a>
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
