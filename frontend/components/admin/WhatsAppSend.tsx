'use client';
import { whatsAppLink } from '@/lib/shopInvite';

// The WhatsApp button on the Customers and Popup Leads rows.
//
// It was briefly a chooser — WhatsApp Web, the desktop app, or plain text —
// because the emoji were arriving as black diamonds and it was not mine to
// decide which compromise the shop should live with. The shop decided: plain
// text, everywhere. So the choice, the stored setting and the dialog are gone,
// and what is left is a link that opens whichever WhatsApp is already running
// with the message in the box, ready to send.
//
// Worth keeping in mind if emoji are ever wanted back: wa.me is not WhatsApp but
// a redirect in front of it, and that redirect is what broke them.

export function WhatsAppSendButton({ phone, firstName }: { phone?: string; firstName?: string }) {
  const link = whatsAppLink(phone, firstName);

  if (!link) {
    return <span title="No usable mobile number here" style={{ color: '#c4bab5' }}>WhatsApp</span>;
  }

  return (
    <a href={link} target="_blank" rel="noopener noreferrer"
       style={{ color: '#128C7E', fontWeight: 650 }}>
      WhatsApp
    </a>
  );
}

/** The line above the table, so the button's behaviour is not a surprise. */
export function WhatsAppModeNote() {
  return (
    <p style={{ fontSize: '.75rem', color: '#8a7f76', margin: '0 0 .7rem' }}>
      WhatsApp opens with the message already written — just press Send.
    </p>
  );
}
