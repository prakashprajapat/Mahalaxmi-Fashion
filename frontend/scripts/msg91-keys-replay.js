// What MSG91 is actually handed for one message.
//
// He reported the Deliverd text arriving with nothing in the Order ID. A key
// that does not match the flow's variable name is NOT an error at MSG91's end:
// it accepts the message, sends it, and leaves that variable blank. The
// response says success, the log says success, and the first anybody knows is
// a customer reading "your order  has been delivered".
//
// So every value now goes under every spelling the flow might be holding it
// under. These cases are about what that must and must not do.

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// ── SmsService.SendTemplateAsync, the recipient object ───────────────────
function recipientFor(phone, values, named) {
  const r = { mobiles: phone };

  const put = (key, value) => {
    if (!key) return;
    if (key.toLowerCase() === 'mobiles') return;
    r[key] = value;
    r[key.toUpperCase()] = value;
    r[key.toLowerCase()] = value;
    const tight = key.split('_').join('');
    if (tight.length > 0 && tight !== key) {
      r[tight] = value;
      r[tight.toUpperCase()] = value;
      r[tight.toLowerCase()] = value;
    }
  };

  (values ?? []).forEach((v, i) => put(`var${i + 1}`, v ?? ''));
  if (named) for (const [k, v] of Object.entries(named)) put(k, v ?? '');
  return r;
}

// ═══ 1. The Delivered message, as the messenger builds it ════════════════
{
  const r = recipientFor('919353568638', ['Prema', 'MFH1014'],
    { name: 'Prema', order_id: 'MFH1014' });

  t('1a lowercase var, for a flow built on {#var#}', [r.var1, r.var2], ['Prema', 'MFH1014']);
  t('1b and uppercase, which is how MSG91 documents it', [r.VAR1, r.VAR2], ['Prema', 'MFH1014']);
  t('1c the name under both spellings', [r.name, r.NAME], ['Prema', 'Prema']);
  t('1d and the order id under all four it could be called',
    [r.order_id, r.ORDER_ID, r.orderid, r.ORDERID],
    ['MFH1014', 'MFH1014', 'MFH1014', 'MFH1014']);
  t('1e the number is untouched', r.mobiles, '919353568638');
}

// ═══ 2. The order id is never blank in any of its spellings ══════════════
//
// The actual complaint. Whatever his flow calls it, one of these keys has to
// carry MFH1014.
{
  const r = recipientFor('919353568638', ['Prema', 'MFH1014'],
    { name: 'Prema', order_id: 'MFH1014' });
  const carrying = Object.keys(r).filter(k => r[k] === 'MFH1014').sort();
  t('2a five keys carry it', carrying, ['ORDERID', 'ORDER_ID', 'VAR2', 'order_id', 'orderid', 'var2'].sort());
  t('2b and none of them is empty', carrying.every(k => r[k].length > 0), true);
}

// ═══ 3. A variable called "mobiles" must not redirect the message ════════
//
// Overwriting it would send the text to whatever that value was - somebody
// else's parcel update to a number nobody chose.
{
  const r = recipientFor('919353568638', ['x'], { mobiles: '919999999999', MOBILES: '918888888888' });
  t('3a the recipient stands', r.mobiles, '919353568638');
}

// ═══ 4. Nothing is lost when values and names overlap ════════════════════
{
  const r = recipientFor('91935', ['A', 'B', 'C'], { name: 'A', order_id: 'B', amount: 'C' });
  t('4a three positions', [r.var1, r.var2, r.var3], ['A', 'B', 'C']);
  t('4b three names', [r.name, r.order_id, r.amount], ['A', 'B', 'C']);
}

// ═══ 5. Empty and missing values do not throw or vanish the key ══════════
//
// A refund of nothing, or a name we could not read: the key must still be
// present, or MSG91 leaves the variable blank for a different reason and the
// cause becomes untraceable.
{
  const r = recipientFor('91935', ['', null], { name: '', order_id: null });
  t('5a the keys exist', ['var1' in r, 'var2' in r, 'name' in r, 'order_id' in r], [true, true, true, true]);
  t('5b as empty strings, not undefined', [r.var1, r.var2, r.name, r.order_id], ['', '', '', '']);
}

// ═══ 6. No value ever lands under a key belonging to another ═════════════
//
// The guard against being clever: spelling variants must not collide. If
// "order_id" and "orderId" were both sent, one would win and the other's
// value would be wrong rather than missing - worse than blank, because
// nobody would notice.
{
  const r = recipientFor('91935', ['Prema', 'MFH1014'], { name: 'Prema', order_id: 'MFH1014' });
  const wrong = Object.entries(r).filter(([k, v]) =>
    k !== 'mobiles' && k.toLowerCase().replace('_', '').startsWith('order') && v !== 'MFH1014');
  t('6a nothing order-shaped carries the wrong value', wrong, []);
  const nameKeys = Object.entries(r).filter(([k, v]) => k.toLowerCase() === 'name' && v !== 'Prema');
  t('6b and nothing name-shaped does either', nameKeys, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
