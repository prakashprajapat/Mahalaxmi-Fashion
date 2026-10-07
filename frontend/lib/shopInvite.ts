// The "come and have a look" message, as WhatsApp renders it.
//
// Written out here rather than in the page because the same words go out two
// ways — this one and the email built in backend/Services/EmailService.cs — and
// two copies of a shop's own words drift apart within a month.
//
// Two things shape how it is written.
//
// WhatsApp is not Markdown. A [label](link) is shown to the customer exactly as
// typed, brackets and all, and nothing is clickable; bold is one asterisk, not
// two. So the links stand on their own lines, which is also what makes them
// tappable, and the headings are single-asterisk bold.
//
// And there are no emoji in it, on purpose, after four rounds of trying. A link
// of the form wa.me/<number>?text=<message> does not go to WhatsApp: it goes to
// a redirect that takes the link apart and builds it again, and the rebuild was
// turning every emoji into a black diamond. The address bar is what proved it —
// spaces arriving as + and asterisks as %2A, neither of which this code writes.
// A message full of black diamonds reads as a shop whose messages are broken,
// so the shop chose plain, and plain is what this sends. The bullet and the em
// dash stay; both are old enough to survive anything.

const SITE = 'https://www.mahalaxmifashionhub.com';
const APP = 'https://play.google.com/store/apps/details?id=com.mahalaxmifashionhub.www.twa';
const AFFILIATE = 'https://affiliate.mahalaxmifashionhub.com/';

export function shopInviteText(firstName?: string): string {
  const hello = firstName?.trim() ? `Hello ${firstName.trim()}! ` : '';

  return `*Welcome to Mahalaxmi Fashion Hub!*

${hello}You are already part of our fashion family — and there is a lot on the shelves now that was not there last time.

New in: *Sarees, Nighties, Dresses, Kurti Sets and Rajasthani Wear*

*Shop now*
${SITE}/?utm_source=whatsapp&utm_medium=invite

*Shop easily on our app*
${APP}

*Refer & Earn* — invite your friends and family, earn rewards
${SITE}/account/refer

*Are you a creator?* Join our affiliate programme and earn by promoting our products
${AFFILIATE}

Your next favourite outfit might be just one click away!

*Mahalaxmi Fashion Hub*
_Fashion • Quality • Value_`;
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

/**
 * This customer's chat, with the message already in the box.
 *
 * wa.me opens whichever WhatsApp the computer or phone already uses, with no
 * second sign-in to arrange. Its redirect is what mangled the emoji, and with
 * none left to mangle there is nothing in the way of the plainest route.
 */
export function whatsAppLink(phone?: string, firstName?: string): string {
  const num = whatsAppNumber(phone);
  if (!num) return '';
  return `https://wa.me/${num}?text=${encodeURIComponent(shopInviteText(firstName))}`;
}
