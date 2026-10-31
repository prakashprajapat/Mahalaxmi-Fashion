#!/usr/bin/env python3
"""No emoji in anything a person reads.

The shop's screens are its shopfront. A nav full of little pictures reads as a
hobby project, and the same labels in plain words read as a business - which is
the judgement a first-time visitor makes before they have read a single line.

Taking 592 of them out by hand was a day's work. Putting one back is one
keystroke, so this runs with the rest of the checkers.

Kept on purpose, because they are typography rather than pictures:

    U+2713 U+2714   the check marks a list is ticked with
    U+2715 U+2716   the multiplication x a close button uses
    U+2717 U+2718   the ballot crosses
    U+2605 U+2606   the stars a rating is drawn with
    U+275A          the heavy bar used as a separator

Arrows, the rupee sign, dashes and quotation marks are not emoji and are not
touched.

Run: python3 -I Scripts/check-no-emoji.py
"""
import io
import os
import sys

KEEP = {0x2713, 0x2714, 0x2715, 0x2716, 0x2717, 0x2718, 0x2605, 0x2606, 0x275A}

SCOPE = ('.tsx', '.ts', '.cs', '.xml')
SKIP_DIRS = {'.git', 'node_modules', '.next', 'bin', 'obj', '_to_delete'}


def is_emoji(ch):
    o = ord(ch)
    if o in KEEP:
        return False
    if o in (0xFE0F, 0x200D):          # the emoji presentation selector, and the joiner
        return True
    return ((0x1F000 <= o <= 0x1FAFF)
            or (0x2600 <= o <= 0x27BF)
            or (0x2B00 <= o <= 0x2BFF)
            or (0x1F1E6 <= o <= 0x1F1FF))


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    bad = []
    checked = 0

    for here, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            if not n.endswith(SCOPE):
                continue
            p = os.path.join(here, n)
            try:
                src = io.open(p, encoding='utf-8').read()
            except Exception:
                continue
            checked += 1
            for i, line in enumerate(src.split('\n'), 1):
                hits = sorted({c for c in line if is_emoji(c)})
                if hits:
                    shown = ' '.join('U+%04X' % ord(c) for c in hits)
                    bad.append((p, i, shown, line.strip()[:100]))

    if bad:
        print('check-no-emoji: %d line(s) have emoji in them' % len(bad))
        for p, i, shown, line in bad[:40]:
            print('  %s:%d  %s  %s' % (p, i, shown, line))
        if len(bad) > 40:
            print('  ... and %d more' % (len(bad) - 40))
        print('\nUse words. If it is a tick, a cross or a star, use one of the')
        print('plain marks this checker keeps - they are listed at the top of it.')
        return 1

    print('check-no-emoji: %d files, no emoji in anything a person reads' % checked)
    return 0


if __name__ == '__main__':
    sys.exit(main())
