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

/**
 * This customer's chat, with the message already in the box.
 *
 * Deliberately web.whatsapp.com rather than wa.me, and that is the whole point
 * of this function.
 *
 * wa.me is the usual link and on a phone it is perfect. On Windows it is not:
 * the link travels browser -> WhatsApp desktop app, and in that handover
 * anything outside the old Windows-1252 character set is replaced. The shop's
 * first real send arrived with every emoji turned into a black diamond, while
 * the em dash came through intact — and the em dash is in that old set, which
 * is what named the culprit.
 *
 * Putting the message on the clipboard instead did keep the emoji, but it made
 * a one-click job into copy, switch, paste, send, and an empty chat window
 * reads as a broken button however clearly the screen explains itself.
 *
 * web.whatsapp.com never leaves the browser, so nothing converts anything: the
 * message arrives exactly as written, in one click. The cost is that the
 * browser has to be signed in to WhatsApp Web — scanned once from the phone,
 * and it stays signed in.
 */
export function whatsAppWebLink(phone?: string, firstName?: string): string {
  const num = whatsAppNumber(phone);
  if (!num) return '';
  return `https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(shopInviteText(firstName))}`;
}

/**
 * The same chat in the WhatsApp app installed on this computer.
 *
 * Offered because that is where the shop already works all day, and signing in
 * to WhatsApp Web is a step some people would rather not take. The cost is the
 * handover described above: the words and the links arrive intact, the emoji
 * may not. Which of the two matters more is not a judgement to make on somebody
 * else's behalf, so the screen asks once and remembers.
 */
export function whatsAppDesktopLink(phone?: string, firstName?: string): string {
  const num = whatsAppNumber(phone);
  if (!num) return '';
  return `https://wa.me/${num}?text=${encodeURIComponent(shopInviteText(firstName))}`;
}
