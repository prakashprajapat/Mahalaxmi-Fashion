#!/usr/bin/env python3
"""
C# file ke bracket balance ki jaanch - jab is machine par dotnet na ho.

Kyun: ek saada regex wala checker is repo par jhootha jawab deta hai. Program.cs
aur OrdersController.cs dono "galat" batata tha jabki wo theek the - kyunki unme
@"..." wale bade raw-SQL block aur $"..." wali interpolated string hain, jinke
andar ke bracket code nahi hote. Us jhoothe jawab par bharosa karke asli kharabi
nikal jaati, ya theek code ko toota maan liya jata.

Isliye yahan poora stripper hai: line aur block comment, @"" verbatim string
(jisme "" ka matlab ek quote hai), $"" interpolated, saadi string jisme \ se
escape hota hai, aur char literal - sab hata kar sirf code ke bracket ginta hai.
Ginti ke saath nesting bhi dekhta hai, taki "}{" jaisa ulta jodha pakda jaye.

Istemal:  python3 Scripts/check-cs-brackets.py Controllers/Foo.cs [...]
Lautata:  0 = sab theek, 1 = koi file galat
"""
import io, sys

def strip(src):
    """C# se comment, string, char hata do - sirf code ke bracket bachein."""
    out, i, n = [], 0, len(src)
    while i < n:
        c  = src[i]
        c2 = src[i:i+2]
        c3 = src[i:i+3]
        # comments
        if c2 == '//':
            while i < n and src[i] != '\n': i += 1
            continue
        if c2 == '/*':
            i += 2
            while i < n and src[i:i+2] != '*/': i += 1
            i += 2; continue
        # verbatim string: @"..."  $@"..."  @$"..."   ("" = escaped quote)
        if c3 in ('$@"', '@$"') or c2 == '@"':
            i += len(c3) if c3 in ('$@"', '@$"') else 2
            while i < n:
                if src[i] == '"':
                    if src[i:i+2] == '""': i += 2; continue
                    i += 1; break
                i += 1
            continue
        # raw/interpolated/normal string: "..."  $"..."   (\ escapes)
        if c2 == '$"' or c == '"':
            i += 2 if c2 == '$"' else 1
            while i < n:
                if src[i] == '\\': i += 2; continue
                if src[i] == '"': i += 1; break
                i += 1
            continue
        # char literal
        if c == "'":
            i += 1
            while i < n:
                if src[i] == '\\': i += 2; continue
                if src[i] == "'": i += 1; break
                i += 1
            continue
        out.append(c); i += 1
    return ''.join(out)

bad = 0
for f in sys.argv[1:]:
    s = strip(io.open(f, encoding='utf-8').read())
    rows = []
    ok = True
    for o, c, name in (('{','}','brace'), ('(',')','paren'), ('[',']','bracket')):
        a, b = s.count(o), s.count(c)
        if a != b: ok = False
        rows.append(f"{name} {a}/{b}")
    # nesting bhi jaancho, sirf ginti nahi
    depth = {'{':0,'(':0,'[':0}; pair = {'}':'{',')':'(',']':'['}
    for ch in s:
        if ch in depth: depth[ch] += 1
        elif ch in pair:
            depth[pair[ch]] -= 1
            if depth[pair[ch]] < 0: ok = False
    print(f"{'OK  ' if ok else 'FAIL'} {f:45} {'  '.join(rows)}")
    if not ok: bad += 1
sys.exit(1 if bad else 0)
