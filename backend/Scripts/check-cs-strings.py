# -*- coding: utf-8 -*-
"""Check that every C# string and char literal is properly closed.

    python3 Scripts/check-cs-strings.py $(find . -name '*.cs' -not -path './bin/*' -not -path './obj/*')

Kyun: Program.cs me poora database schema ek @"..." verbatim string ke andar
likha hai. Us string ke andar ek akela " (jaise SQL comment me likha hua
ek shabd quote me) string ko wahin band kar deta hai, aur uske baad ki poori
file bikhar jati hai - ek chhoti galti, 200 se zyada compiler errors, aur
koi bhi error line asli jagah nahi batata.

Ek baar aisa ho chuka hai aur deploy wahin ruk gaya tha. Ye script usi ek
cheez ko dekhti hai, bina compiler ke: @"..." me " dohra hona chahiye (""),
aam "..." pankti ke andar hi band honi chahiye, aur $"{...}" ke chhed ke
andar aam C# chalta hai. Compiler ki jagah nahi leti - uski ek aadat par
pehra deti hai, wahan jahan dotnet maujood na ho.

Return code: 0 = saaf, 1 = kahin kuch khula reh gaya."""
import io, sys

class Bad(Exception):
    def __init__(self, line, msg): self.line, self.msg = line, msg

class Scanner:
    def __init__(self, s):
        self.s, self.n, self.i, self.line = s, len(s), 0, 1

    def adv(self, j):
        self.line += self.s.count('\n', self.i, j); self.i = j

    def run(self, stop_brace=False):
        s, n = self.s, self.n
        while self.i < n:
            c = s[self.i]
            if c == '\n': self.line += 1; self.i += 1; continue
            if stop_brace and c == '}': return
            if stop_brace and c == '{':
                self.i += 1; self.run(stop_brace=True)
                if self.i < n: self.i += 1
                continue
            if s.startswith('//', self.i):
                j = s.find('\n', self.i); self.i = n if j < 0 else j; continue
            if s.startswith('/*', self.i):
                j = s.find('*/', self.i + 2)
                if j < 0: raise Bad(self.line, 'block comment never closed')
                self.adv(j + 2); continue
            if s.startswith('"""', self.i):
                raise Bad(self.line, 'raw string literal - scanner does not handle these')
            interp = vb = False
            if s.startswith('@"', self.i): vb, off = True, 2
            elif s.startswith('$@"', self.i) or s.startswith('@$"', self.i): vb = interp = True; off = 3
            elif s.startswith('$"', self.i): interp, off = True, 2
            elif c == '"': off = 1
            elif c == "'": off = None
            else: self.i += 1; continue

            if off is None:          # char literal
                start, j = self.line, self.i + 1
                while j < n:
                    if s[j] == '\\': j += 2; continue
                    if s[j] == '\n': raise Bad(start, 'unterminated char literal')
                    if s[j] == "'": break
                    j += 1
                else: raise Bad(start, 'unterminated char literal')
                self.i = j + 1; continue

            start = self.line
            self.i += off
            while True:
                if self.i >= n: raise Bad(start, 'unterminated string literal')
                ch = s[self.i]
                if ch == '\n':
                    if vb: self.line += 1; self.i += 1; continue
                    raise Bad(start, 'unterminated string literal')
                if not vb and ch == '\\': self.i += 2; continue
                if ch == '"':
                    if vb and self.i + 1 < n and s[self.i+1] == '"': self.i += 2; continue
                    self.i += 1; break
                if interp and ch == '{':
                    if self.i + 1 < n and s[self.i+1] == '{': self.i += 2; continue
                    self.i += 1
                    self.run(stop_brace=True)
                    if self.i < n: self.i += 1      # closing }
                    continue
                self.i += 1
        if stop_brace: raise Bad(self.line, 'interpolation hole never closed')

bad = 0
for p in sys.argv[1:]:
    try:
        Scanner(io.open(p, encoding='utf-8').read()).run()
    except Bad as e:
        print('%s:%d  %s' % (p, e.line, e.msg)); bad += 1
print('clean' if bad == 0 else '%d file(s) with a problem' % bad)
sys.exit(1 if bad else 0)
