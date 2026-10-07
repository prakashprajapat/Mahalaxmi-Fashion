// The "come and have a look" message, as WhatsApp renders it.
//
// Written out here rather than in the page because the same words go out two
// ways — this one and the email built in backend/Services/EmailService.cs — and
// two copies of a shop's own words drift apart within a month.
//
// WhatsApp is not Markdown. A [label](link) is shown to the customer exactly as
// typed, brackets and all, and nothing is clickable; bold is one asterisk, not
// two. So the links stand on their own lines, which is also how they become
// tappable, and the headings are single-asterisk bold.

const SITE = 'https://www.mahalaxmifashionhub.com';
const APP = 'https://play.google.com/store/apps/details?id=com.mahalaxmifashionhub.www.twa';
const AFFILIATE = 'https://affiliate.mahalaxmifashionhub.com/';

export function shopInviteText(firstName?: string): string {
  const hello = firstName?.trim() ? `Hello ${firstName.trim()}! ` : '';

  return `🛍️ *Welcome to Mahalaxmi Fashion Hub!* ❤️

${hello}You are already part of our fashion family — and there is a lot on the shelves now that was not there last time ✨

New in: *Sarees, Nighties, Dresses, Kurti Sets and Rajasthani Wear* 👗

🌐 *Shop now*
${SITE}/?utm_source=whatsapp&utm_medium=invite

📱 *Shop easily on our app*
${APP}

💰 *Refer & Earn* — invite your friends and family, earn rewards
${SITE}/account/refer

🤝 *Are you a creator?* Join our affiliate programme and earn by promoting our products
${AFFILIATE}

✨ Your next favourite outfit might be just one click away!

*Mahalaxmi Fashion Hub*
_Fashion • Quality • Value_ ❤️`;
}

/**
 * The number WhatsApp wants: country code and digits, nothing else — no plus,
 * no spaces, no brackets. A ten-digit Indian mobile arrives in the database in
 * all of those shapes. Returns '' when there is nothing usable.
 */
export function whatsAppNumber(phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  const ten = digits.slice(-10);
  if (!/^[6-9]/.test(ten)) return '';          // not an Indian mobile
  return `91${ten}`;
}

/** Just the chat, with nothing typed into it. */
export function whatsAppChatLink(phone?: string): string {
  const num = whatsAppNumber(phone);
  return num ? `https://wa.me/${num}` : '';
}

/**
 * Open this customer's chat with the message ready to paste.
 *
 * The obvious way to do this is wa.me/<number>?text=<message>, and that is what
 * this did at first. On a phone it is perfect. On Windows it is not: the link
 * goes through the browser to the WhatsApp desktop app, and somewhere in that
 * handover anything outside the old Windows-1252 character set is replaced with
 * a question mark. The shop's first real send arrived with every emoji turned
 * into a black diamond — the em dash survived, because it happens to live in
 * that old set, which is what gave the cause away.
 *
 * So the message goes to the clipboard, where nothing touches it, and the chat
 * opens empty. One Ctrl+V and it is exactly as written, on every machine.
 *
 * Returns true when the message is on the clipboard. False means the browser
 * refused — some do, outside a secure page or without a user gesture — and the
 * caller should fall back to ?text= rather than open an empty chat with nothing
 * to paste.
 */
export async function copyInviteAndOpenChat(phone?: string, firstName?: string): Promise<boolean> {
  const chat = whatsAppChatLink(phone);
  if (!chat) return false;

  const text = shopInviteText(firstName);
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = false;
  }

  window.open(copied ? chat : `${chat}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return copied;
}
