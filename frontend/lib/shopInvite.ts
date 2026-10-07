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

/**
 * The same message, with or without the emoji.
 *
 * The plain version is not a lesser one. Somewhere between this page and the
 * customer's phone the emoji have been arriving as black diamonds, and a
 * diamond is worse than no emoji at all — it reads as a shop whose messages are
 * broken. So the plain version carries the same words, with the bullet and the
 * dash doing the decorating; both of those are old enough to survive anything.
 */
export function shopInviteText(firstName?: string, withEmoji = true): string {
  const hello = firstName?.trim() ? `Hello ${firstName.trim()}! ` : '';
  const e = (emoji: string) => (withEmoji ? emoji + ' ' : '');
  const tail = withEmoji ? ' ✨' : '';

  return `${e('🛍️')}*Welcome to Mahalaxmi Fashion Hub!*${withEmoji ? ' ❤️' : ''}

${hello}You are already part of our fashion family — and there is a lot on the shelves now that was not there last time${tail}

New in: *Sarees, Nighties, Dresses, Kurti Sets and Rajasthani Wear*${withEmoji ? ' 👗' : ''}

${e('🌐')}*Shop now*
${SITE}/?utm_source=whatsapp&utm_medium=invite

${e('📱')}*Shop easily on our app*
${APP}

${e('💰')}*Refer & Earn* — invite your friends and family, earn rewards
${SITE}/account/refer

${e('🤝')}*Are you a creator?* Join our affiliate programme and earn by promoting our products
${AFFILIATE}

${withEmoji ? '✨ ' : ''}Your next favourite outfit might be just one click away!

*Mahalaxmi Fashion Hub*
_Fashion • Quality • Value_${withEmoji ? ' ❤️' : ''}`;
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
 * This customer's chat on WhatsApp Web, with the message already in the box.
 *
 * web.whatsapp.com is reached directly, and that is the point. The other route,
 * wa.me, does not go to WhatsApp: it goes to a redirect that rewrites the link
 * and hands it on, and the rewrite is where the emoji have been dying. The
 * giveaway was in the address bar — spaces had become + and the asterisks %2A,
 * which is not what this code produces, so something in between had taken the
 * link apart and put it back together badly.
 *
 * The cost is that the browser has to be signed in to WhatsApp Web, scanned once
 * from the phone.
 */
export function whatsAppWebLink(phone?: string, firstName?: string, withEmoji = true): string {
  const num = whatsAppNumber(phone);
  if (!num) return '';
  return `https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(shopInviteText(firstName, withEmoji))}`;
}

/**
 * The same chat in the WhatsApp app installed on this computer.
 *
 * Offered because that is where the shop already works all day, and signing in
 * to WhatsApp Web is a step some people would rather not take. This is the route
 * that goes through the rewriting redirect, so it is also the one where the
 * emoji may not survive — which is why the plain-text choice exists beside it.
 */
export function whatsAppDesktopLink(phone?: string, firstName?: string, withEmoji = true): string {
  const num = whatsAppNumber(phone);
  if (!num) return '';
  return `https://wa.me/${num}?text=${encodeURIComponent(shopInviteText(firstName, withEmoji))}`;
}
