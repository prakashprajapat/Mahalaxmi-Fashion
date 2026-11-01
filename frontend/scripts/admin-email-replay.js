// The field that was both the owner's login and a mailing list.
//
// admin_email is compared WHOLE by the login and by password recovery, and
// SPLIT ON COMMAS by the alert mailer. The Settings screen asked, in its own
// label, for more than one address separated by commas. Somebody did what the
// label said and could then neither sign in nor recover the password - both
// doors answer to that one string, and both stopped matching.
//
// These cases cover the lockout, the way back in, and the guard that stops it
// happening again.

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ── AuthController.OwnerAddress ──────────────────────────────────────────
function ownerAddress(raw) {
  const first = String(raw ?? '')
    .split(/[,;\n\r\t]+/)
    .map(x => x.trim())
    .find(x => x.includes('@'));
  return first ?? String(raw ?? '').trim();
}

// ── AdminNotifier.Recipients ─────────────────────────────────────────────
const recipients = raw => [...new Set(String(raw ?? '')
  .split(/[,;\s\n\r\t]+/)
  .map(x => x.trim())
  .filter(x => x.includes('@') && !x.startsWith('@') && !x.endsWith('@'))
  .map(x => x.toLowerCase()))];

// ── AdminNotifier.AdminEmailAsync ────────────────────────────────────────
const alertsGoTo = (notifyEmails, adminEmail, serverDefault = '') => {
  if (String(notifyEmails ?? '').trim()) return recipients(notifyEmails);
  if (String(adminEmail ?? '').trim()) return recipients(adminEmail);
  return recipients(serverDefault);
};

// ── the two doors ────────────────────────────────────────────────────────
const canSignIn = (typed, stored) =>
  ownerAddress(stored).toLowerCase() === String(typed ?? '').trim().toLowerCase();
const recoveryKnows = canSignIn;

// ── SettingsController.WhyRefused ────────────────────────────────────────
function whyRefused(key, value) {
  if (key.toLowerCase() !== 'admin_email') return null;
  const v = String(value ?? '').trim();
  if (v.length === 0) return null;
  if (v.split(/[,;\s\n\r\t]+/).filter(Boolean).length > 1)
    return 'The admin email is the address you sign in with, so it holds one address only. '
         + 'For order and payment alerts to several people, use "Alert emails" instead.';
  if (!v.includes('@')) return 'That is not an email address, and it is the one you sign in with.';
  return null;
}

const OWNER = 'admin@mahalaxmifashionhub.com';
const BOTH = 'mahalaxmifashionhub@gmail.com, dharmendarkumar080906@gmail.com';

// ═══ 1. What actually happened ═══════════════════════════════════════════
//
// The old login compared the whole string. Two addresses in the box and the
// owner is locked out of the admin AND out of recovery, with a correct
// password and a correct email.
{
  const oldCompare = (typed, stored) =>
    String(stored ?? '').trim().toLowerCase() === String(typed ?? '').trim().toLowerCase();

  t('1a the old login refuses the right address', oldCompare(OWNER, BOTH), false);
  t('1b and so does recovery - both doors, one string', oldCompare(OWNER, BOTH), false);
  // The alerts, meanwhile, worked perfectly. That is what made it look fine.
  t('1c while the alerts went to both, which is why nothing looked wrong',
    recipients(BOTH).length, 2);
}

// ═══ 2. The way back in, without touching the database ═══════════════════
//
// Reading the first address means a list already stored stops being a
// lockout. He can get in and tidy up rather than needing SQL.
{
  t('2a the owner signs in again', canSignIn(OWNER, `${OWNER}, someone@else.com`), true);
  t('2b and recovery knows the address', recoveryKnows(OWNER, `${OWNER}, someone@else.com`), true);
  // The addresses after the first are not a second owner login.
  t('2c the second address is not a way in', canSignIn('someone@else.com', `${OWNER}, someone@else.com`), false);
}

// ═══ 3. An ordinary single address is untouched ══════════════════════════
{
  t('3a plain', canSignIn(OWNER, OWNER), true);
  t('3b spaces around it', canSignIn(OWNER, `  ${OWNER}  `), true);
  t('3c different case', canSignIn('Admin@MahalaxmiFashionHub.com', OWNER), true);
  t('3d a different address still refused', canSignIn('someone@else.com', OWNER), false);
}

// ═══ 4. The alerts now have a field of their own ═════════════════════════
{
  t('4a both addresses get the alerts', alertsGoTo(BOTH, OWNER).length, 2);
  t('4b and the login is not one of them', alertsGoTo(BOTH, OWNER).includes(OWNER), false);
  // A shop that never sets the new field keeps what it had.
  t('4c blank falls back to the admin email', alertsGoTo('', OWNER), [OWNER]);
  t('4d and then to the server default', alertsGoTo('', '', 'shop@server.com'), ['shop@server.com']);
  // Rubbish in the list does not take the good addresses down with it.
  t('4e nonsense is dropped, not handed to the mail server',
    alertsGoTo('good@x.com, notanemail, @nope, bad@', OWNER), ['good@x.com']);
}

// ═══ 5. The door is shut on the way in ═══════════════════════════════════
{
  t('5a two addresses are refused', whyRefused('admin_email', BOTH) !== null, true);
  t('5b and the message says where they belong',
    whyRefused('admin_email', BOTH).includes('Alert emails'), true);
  t('5c one address is fine', whyRefused('admin_email', OWNER), null);
  t('5d blank is fine - it falls back to the server', whyRefused('admin_email', '   '), null);
  t('5e something that is not an address is refused',
    whyRefused('admin_email', 'prakash') !== null, true);
  t('5f semicolons and spaces count as a second address too',
    [whyRefused('admin_email', 'a@x.com; b@y.com') !== null,
     whyRefused('admin_email', 'a@x.com b@y.com') !== null], [true, true]);
  // Every other setting is none of this guard's business.
  t('5g the alert list may hold as many as it likes',
    whyRefused('notifyEmails', BOTH), null);
  t('5h and so may everything else', whyRefused('msg91SenderId', 'a, b'), null);
}

// ═══ 6. The whole sequence, end to end ═══════════════════════════════════
//
// What he did, what broke, and what the shop looks like afterwards.
{
  const settings = { admin_email: OWNER, notifyEmails: '' };

  t('6a before: he can sign in', canSignIn(OWNER, settings.admin_email), true);

  // The advice that caused it. The screen now refuses it outright.
  const refused = whyRefused('admin_email', BOTH);
  t('6b putting both addresses in the login box is refused', refused !== null, true);

  // Done the right way instead.
  settings.notifyEmails = BOTH;
  t('6c the alerts reach both people', alertsGoTo(settings.notifyEmails, settings.admin_email).length, 2);
  t('6d and he can still sign in', canSignIn(OWNER, settings.admin_email), true);
  t('6e and still recover the password', recoveryKnows(OWNER, settings.admin_email), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
