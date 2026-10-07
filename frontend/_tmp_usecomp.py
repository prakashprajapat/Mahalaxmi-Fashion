import io, sys

CUSTOMERS, LEADS = sys.argv[1], sys.argv[2]


def edit(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new, why in pairs:
        assert old in s, f'{path}: anchor missing: {why}'
        assert s.count(old) == 1, f'{path}: anchor not unique: {why}'
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('updated', path)


OLD_NOTE = """        <p style={{ fontSize: '.75rem', color: '#8a7f76', margin: '0 0 .7rem' }}>
          WhatsApp opens in a new tab with the message already written — just press Send. It uses
          WhatsApp Web, so sign in there once from your phone and it stays signed in.
        </p>
"""

edit(CUSTOMERS, [
    ("import { whatsAppWebLink } from '@/lib/shopInvite';",
     "import { WhatsAppSendButton, WhatsAppModeNote } from '@/components/admin/WhatsAppSend';",
     'customers import'),

    ("                  const wa = whatsAppWebLink(c.phone, c.firstName);\n", "", 'customers row var'),

    ("""                          {wa
                            ? <a href={wa} target="_blank" rel="noopener noreferrer" style={{ color: '#128C7E', fontWeight: 650 }}>WhatsApp</a>
                            : <span title="No usable mobile number on this account" style={{ color: '#c4bab5' }}>WhatsApp</span>}""",
     "                          <WhatsAppSendButton phone={c.phone} firstName={c.firstName} />",
     'customers button'),

    (OLD_NOTE, "        <WhatsAppModeNote />\n", 'customers note'),
])

edit(LEADS, [
    ("import { whatsAppWebLink } from '@/lib/shopInvite';",
     "import { WhatsAppSendButton, WhatsAppModeNote } from '@/components/admin/WhatsAppSend';",
     'leads import'),

    ("                  const wa = whatsAppWebLink(l.phone ?? undefined, (l.name ?? '').split(' ')[0] || undefined);\n", "", 'leads row var'),

    ("""                          {wa
                            ? <a href={wa} target="_blank" rel="noopener noreferrer" style={{ color: '#128C7E', fontWeight: 650 }}>WhatsApp</a>
                            : <span title="No usable mobile number on this lead" style={{ color: '#c4bab5' }}>WhatsApp</span>}""",
     "                          <WhatsAppSendButton phone={l.phone ?? undefined} firstName={(l.name ?? '').split(' ')[0] || undefined} />",
     'leads button'),

    (OLD_NOTE, "        <WhatsAppModeNote />\n", 'leads note'),
])
