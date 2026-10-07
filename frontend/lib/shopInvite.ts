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
 * A wa.me link for this customer, or '' when there is no usable number.
 *
 * wa.me wants the country code and nothing else — no plus, no spaces, no
 * brackets. A ten-digit Indian number arrives in the database in all of those
 * shapes, so it is reduced to digits and given a 91 if it has not got one.
 */
export function whatsAppLink(phone?: string, firstName?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  const ten = digits.slice(-10);
  if (!/^[6-9]/.test(ten)) return '';          // not an Indian mobile
  return `https://wa.me/91${ten}?text=${encodeURIComponent(shopInviteText(firstName))}`;
}
