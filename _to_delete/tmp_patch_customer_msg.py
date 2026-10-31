import io, os, sys

ROOT = os.path.expanduser('~/mnt/mahalaxmi-nextjs')

def read(p):
    with io.open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()

def write(p, s):
    with io.open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='') as f:
        f.write(s)

def once(text, old, new, what):
    n = text.count(old)
    if n != 1:
        print('ABORT %s: anchor found %d times' % (what, n))
        sys.exit(1)
    return text.replace(old, new)

# ── 1. Program.cs: register the sweep ──────────────────────────────────────
p = 'backend/Program.cs'
s = read(p)
if 'CustomerMessageService' in s:
    print('skip Program.cs (already registered)')
else:
    s = once(s,
        'builder.Services.AddHostedService<AbandonedCartService>();',
        'builder.Services.AddHostedService<AbandonedCartService>();\n'
        '// The two customer messages that are sent by a clock rather than by an event:\n'
        '// the review ask an hour after delivery, and the nudge an hour after a\n'
        '// payment nobody finished. The other five go from the code that handles\n'
        '// the event itself.\n'
        'builder.Services.AddHostedService<CustomerMessageService>();',
        'Program.cs hosted service')
    write(p, s)
    print('patched Program.cs')

# ── 2. Settings page: the seven template ids and the switch ────────────────
p = 'frontend/app/(admin)/admin/settings/page.tsx'
s = read(p)
if 'msg91TplOrderConfirm' in s:
    print('skip settings page (already there)')
else:
    anchor = (
        "      { key: 'celebrationOfferPercent',   label: 'Offer Discount % (default 10)', type: 'text' },\n"
        "      { key: 'adminRecoveryPhone',        label: 'Admin Recovery Mobile (for password-reset OTP SMS, with 91)', type: 'text' },\n"
        "    ]\n"
        "  },\n"
    )
    new = anchor + (
        "  {\n"
        "    title: '\\ud83d\\udce6 Automatic SMS to the customer about their order',\n"
        "    desc: 'Seven DLT templates, each sent on its own trigger: the order is placed, the waybill is made, '\n"
        "        + 'the parcel goes out for delivery, it arrives, it comes back instead, the review ask an hour after '\n"
        "        + 'delivery (three times, 48 hours apart), and the nudge an hour after someone reaches the payment page '\n"
        "        + 'and does not pay. Paste the MSG91 FLOW id for each one \\u2014 not the DLT template id. A box left blank '\n"
        "        + 'simply means that message is not sent; nothing else breaks.',\n"
        "    fields: [\n"
        "      { key: 'customerSmsEnabled',   label: 'Master switch \\u2014 type off to stop every message below. Leave blank for on.', type: 'text' },\n"
        "      { key: 'msg91TplOrderConfirm', label: '\\ud83d\\uded2 Order placed \\u2014 MSG91 flow id for template \\\"OrderConfirm\\\" (variables: name, order_id)', type: 'text' },\n"
        "      { key: 'msg91TplTracking',     label: '\\ud83d\\ude9a Shipped \\u2014 flow id for template \\\"TRAKING NO\\\", sent as soon as the AWB is generated (variables: name, order_id, awb)', type: 'text' },\n"
        "      { key: 'msg91TplOutForDelivery', label: '\\ud83c\\udfcd\\ufe0f Out for delivery \\u2014 flow id for template \\\"Out Of Delivery\\\" (variables: name, order_id)', type: 'text' },\n"
        "      { key: 'msg91TplDelivered',    label: '\\u2705 Delivered \\u2014 flow id for template \\\"Deliverd\\\" (variables: name, order_id)', type: 'text' },\n"
        "      { key: 'msg91TplRefund',       label: '\\u21a9\\ufe0f Returned / RTO \\u2014 flow id for template \\\"Refund3\\\", sent only when money is owed back (variables: name, order_id, amount)', type: 'text' },\n"
        "      { key: 'msg91TplReview',       label: '\\u2b50 Review ask \\u2014 flow id for template \\\"Review2\\\". Goes 1 hour after delivery, then twice more every 48 hours, and stops the moment a review arrives (variables: name, order_id, number)', type: 'text' },\n"
        "      { key: 'msg91TplUserDropped',  label: '\\ud83d\\udcb3 Payment not finished \\u2014 flow id for template \\\"USER_DROPPED2\\\", sent 1 hour later, once per customer per day (variables: order_id, date, amount)', type: 'text' },\n"
        "    ]\n"
        "  },\n"
    )
    s = once(s, anchor, new, 'settings page section')
    write(p, s)
    print('patched settings page')

print('done')
