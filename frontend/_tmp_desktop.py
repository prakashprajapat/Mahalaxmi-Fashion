import io, sys

p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()

anchor = """export function whatsAppWebLink(phone?: string, firstName?: string): string {
  const num = whatsAppNumber(phone);
  if (!num) return '';
  return `https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(shopInviteText(firstName))}`;
}"""

addition = anchor + """

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
}"""

assert anchor in s, 'web link anchor missing'
assert 'whatsAppDesktopLink' not in s, 'already added'
io.open(p, 'w', encoding='utf-8').write(s.replace(anchor, addition, 1))
print('shopInvite.ts updated')
