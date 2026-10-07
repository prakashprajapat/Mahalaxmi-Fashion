'use client';
import { whatsAppLink } from '@/lib/shopInvite';
import { shortDate } from '@/lib/outreach';

// The WhatsApp button on the Customers and Popup Leads rows.
//
// It was briefly a chooser — WhatsApp Web, the desktop app, or plain text —
// because the emoji were arriving as black diamonds and it was not mine to
// decide which compromise the shop should live with. The shop decided: plain
// text, everywhere. So the choice, the stored setting and the dialog are gone.
//
// Worth keeping in mind if emoji are ever wanted back: wa.me is not WhatsApp but
// a redirect in front of it, and that redirect is what broke them.
//
// This is a link rather than a button so it still opens in a new tab, gets a
// middle click, and works with the keyboard. The send is reported on click: the
// browser hands the chat to WhatsApp and the server never hears about it, so
// nothing else can.

export function WhatsAppSendButton({
  phone, firstName, sentAt, onOpened,
}: {
  phone?: string;
  firstName?: string;
  /** When this person was last sent the invite on WhatsApp, if ever. */
  sentAt?: string;
  onOpened?: () => void;
}) {
  const link = whatsAppLink(phone, firstName);

  if (!link) {
    return <span title="No usable mobile number here" style={{ color: '#c4bab5' }}>WhatsApp</span>;
  }

  const when = shortDate(sentAt);

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onOpened?.()}
      title={when ? `Opened on ${when} — click to send again` : 'Opens WhatsApp with the message written'}
      style={{ color: '#128C7E', fontWeight: 650 }}
    >
      {when ? 'WhatsApp ✓' : 'WhatsApp'}
    </a>
  );
}
