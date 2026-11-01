// What the admin-email box accepts, and what it says when it refuses.
//
// The guard itself was right the first time it fired - the Settings screen had
// been open since before the address was changed, so it was still holding the
// old pair - but the message did not say WHAT it had found, and one bad box
// stops the whole save. So the owner saw a wall of red, typed his MSG91 flow
// ids again, and nothing of it was being kept.

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

function whyRefused(key, value) {
  if (key.toLowerCase() !== 'admin_email') return null;
  const v = String(value ?? '').trim();
  if (v.length === 0) return null;
  const parts = v.split(/[,;\s\n\r\t]+/).filter(Boolean);
  const addresses = parts.filter(x => x.includes('@'));
  if (addresses.length > 1)
    return `Nothing was saved. ... this had ${addresses.length}: ${addresses.join(' and ')}. ...`;
  if (addresses.length === 0)
    return `Nothing was saved. ... "${v}" is not an email address.`;
  if (parts.length > 1)
    return 'Nothing was saved. The admin email must be the address on its own ...';
  return null;
}

const OWNER = 'admin@mahalaxmifashionhub.com';
const BOTH = 'mahalaxmifashionhub@gmail.com,dharmendarkumar080906@gmail.com';

// ═══ 1. The one address signs in ═════════════════════════════════════════
t('1a plain', whyRefused('admin_email', OWNER), null);
t('1b with spaces around it', whyRefused('admin_email', `  ${OWNER}  `), null);
t('1c blank falls back to the server', whyRefused('admin_email', '   '), null);

// ═══ 2. Two addresses, named ═════════════════════════════════════════════
{
  const m = whyRefused('admin_email', BOTH);
  t('2a refused', m !== null, true);
  t('2b it says how many', m.includes('this had 2'), true);
  t('2c and which', m.includes('mahalaxmifashionhub@gmail.com') && m.includes('dharmendarkumar080906@gmail.com'), true);
  t('2d and that nothing was saved', m.startsWith('Nothing was saved.'), true);
}

// ═══ 3. A stray comma is not a second person ═════════════════════════════
//
// Counting the separators refused these; counting the @ does not.
t('3a trailing comma', whyRefused('admin_email', `${OWNER},`), null);
t('3b trailing semicolon', whyRefused('admin_email', `${OWNER};`), null);
t('3c leading comma', whyRefused('admin_email', `,${OWNER}`), null);

// ═══ 4. One address with rubbish beside it ═══════════════════════════════
//
// The login compares the WHOLE box, so this would lock him out again.
{
  const m = whyRefused('admin_email', `Prakash ${OWNER}`);
  t('4a refused', m !== null, true);
  t('4b and says why it matters', m.includes('on its own'), true);
}

// ═══ 5. Not an address at all ════════════════════════════════════════════
{
  const m = whyRefused('admin_email', 'prakash');
  t('5a refused', m !== null, true);
  t('5b and quotes what was typed', m.includes('"prakash"'), true);
}

// ═══ 6. Every other box is none of its business ══════════════════════════
t('6a the alert list may hold many', whyRefused('notifyEmails', BOTH), null);
t('6b and so may anything else', whyRefused('msg91TplNewCollection', '6a5af55831f9b37a6a0b7f63'), null);
t('6c even something comma-shaped', whyRefused('alertSmsNumbers', '9429429880,9353568638'), null);

// ═══ 7. His exact situation, both ways round ═════════════════════════════
{
  // The stale screen: refused, and now it says why.
  t('7a before reloading, refused with the reason', whyRefused('admin_email', BOTH) !== null, true);
  // After reloading, the same save goes through - and carries the flow ids
  // that were being thrown away with it.
  const form = { admin_email: OWNER, notifyEmails: BOTH, msg91TplNewCollection: '6a5af55831f9b37a6a0b7f63' };
  const refusals = Object.entries(form).map(([k, v]) => whyRefused(k, v)).filter(Boolean);
  t('7b after reloading, nothing is refused', refusals, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
