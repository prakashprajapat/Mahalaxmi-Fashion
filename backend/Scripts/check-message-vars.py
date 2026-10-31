#!/usr/bin/env python3
"""Does the Check Order Messages screen tell the truth?

The screen exists to answer one question: which value lands in which blank of
which template. It reads its table from MessageTestController.Specs, while the
real messages are built in OrderMessenger. Nothing ties the two together, and
the day they disagree the screen does not break - it quietly reports a mapping
that is not the one customers receive, which is worse than having no screen at
all, because he would then "verify" a template against a lie and change the
wrong thing.

So: for each of the seven templates, the variable names in the controller's
Specs must be exactly the named keys OrderMessenger sends, in the same order.

Run: python3 -I backend/Scripts/check-message-vars.py
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)

MESSENGER = os.path.join(BACKEND, 'Services', 'OrderMessenger.cs')
CONTROLLER = os.path.join(BACKEND, 'Controllers', 'MessageTestController.cs')


def read(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read()


def messenger_mapping(src):
    """{template constant name: [named keys, in the order they are written]}

    Each send is one method whose body holds a `new Dictionary<string, string>`
    literal. The template is named by the constant passed to SendOnceAsync.
    """
    out = {}
    # Split on method starts so one method's dictionary cannot be read as
    # another's. Every send method is `public ... <Name>Async(`.
    parts = re.split(r'\n    (?=public (?:async )?Task<bool> )', src)
    for part in parts:
        m = re.search(r'SendOnceAsync\(\s*[^,]+,\s*(?:OrderMessenger\.)?([A-Za-z]+)\s*,', part)
        if not m:
            continue
        template = m.group(1)
        if template in ('orderId', 'o', 'cf'):
            continue
        dict_m = re.search(r'new Dictionary<string, string>\s*\{(.*?)\}\s*,', part, re.S)
        if not dict_m:
            continue
        keys = re.findall(r'\["(\w+)"\]', dict_m.group(1))
        if keys:
            out[template] = keys
    return out


def controller_mapping(src):
    """{template constant name: [variables listed in Specs]}"""
    out = {}
    block = re.search(r'Specs\s*=\s*\[(.*?)\n    \];', src, re.S)
    if not block:
        return out
    for m in re.finditer(
            r'new\(OrderMessenger\.(\w+),.*?\[([^\]]*)\]\),', block.group(1), re.S):
        template = m.group(1)
        vars_ = re.findall(r'"(\w+)"', m.group(2))
        out[template] = vars_
    return out


def main():
    sent = messenger_mapping(read(MESSENGER))
    shown = messenger_shown = controller_mapping(read(CONTROLLER))

    problems = []

    if not sent:
        problems.append('Could not read any send from OrderMessenger.cs.')
    if not shown:
        problems.append('Could not read Specs from MessageTestController.cs.')

    for template in sorted(set(sent) | set(shown)):
        a = sent.get(template)
        b = shown.get(template)
        if a is None:
            problems.append(
                '%s is listed on the test screen but OrderMessenger never sends it.' % template)
        elif b is None:
            problems.append(
                '%s is sent to customers but is missing from the test screen.' % template)
        elif a != b:
            problems.append(
                '%s: the screen says %s, the real message sends %s.' % (template, b, a))

    if problems:
        print('check-message-vars: the test screen does not match what is sent')
        for p in problems:
            print('  - %s' % p)
        return 1

    print('check-message-vars: %d templates, the test screen matches what is sent'
          % len(sent))
    for template in sorted(sent):
        print('    %-14s %s' % (template, ', '.join(sent[template])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
