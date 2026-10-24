#!/usr/bin/env python3
# Everything a person reads on this site is in English.
#
# Hinglish kept creeping into the admin screens - a button saying "Tayyar 3
# save karo", a watchdog email saying "Kharabi mili", a colour warning saying
# "Colour khali hai". Each one arrived on its own and read fine to whoever
# wrote it. Together they made the panel look half-finished.
#
# Comments are NOT checked and never will be: they are for whoever maintains
# this, there are hundreds of them, and nobody using the site ever sees one.
# This looks only at strings in places a person reads - a button label, an
# alert, a placeholder, a heading, an email subject, an error message.
#
#   python3 Scripts/check-english.py
#
# Exits 1 when it finds something, so it can go in a hook or CI.
#
# A false positive (an Indian place name, a brand) goes in ALLOW below with a
# line saying why. Do not widen a marker word to silence one line.
import io, os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {"node_modules", ".next", ".git", "dist", "build", "obj", "bin", "Scripts"}

WORDS = """nahi nahin hai hain hoga hogi honge hota hoti hote
kar karo karein karna karne karta karti kiya kiye kijiye dabaiye dabao
aap aapka aapki aapke apna apne apni khud
yeh woh iska uska
dobara abhi turant pehle baad phir
naya nayi naye purana purani
sahi galat theek thik
bhejo bhejein bheja daalo daalein daala
dekho dekhein dekha dikhta dikhega dikhayega
rukiye rukein chuna chunein
mila milta milega maangta maangti
badla badlein sakta sakti sakte
jata jati jayega raha rahi rahe
liya liye lein diya diye dein hua hui hue
kya kyun kyunki kaise kahan
koi kuch sabhi zaroori jaruri zarurat kripya kripaya
maloom bina saath upar neeche
bahut thoda zyada baar
paisa paise rupaye dukaan grahak samay jagah
soochi tasveer panna chhod hatao hatayein joda
khali khaali poora poori alag wapas vapas
tayyar taiyar kharabi galti mehnga sasta
bhasha
"""
MARKERS = sorted({w for w in WORDS.split() if w}, key=len, reverse=True)
RE_WORD = re.compile(r"\b(" + "|".join(MARKERS) + r")\b", re.I)
RE_DEVA = re.compile(r"[ऀ-ॿ]")

# Places a person reads.
VISIBLE = re.compile(
    r"(alert\(|confirm\(|toast|placeholder=|title=|aria-label=|label=|sub=|heading=|"
    r"\bmessage\s*[:=]|\bmessage\s*=|Wrap\(|NotifyAsync\(|BadRequest\(|Conflict\(|"
    r"\breturn\s+'|\breturn\s+\"|\breturn\s+`|"
    r"subject|body|TrySmsAsync\(|>\s*[A-Za-z])", re.I)

def strip_comments(src, cs):
    out = list(src); i, n = 0, len(src); in_s = None
    while i < n:
        c = src[i]
        if in_s:
            if c == "\\" and i + 1 < n: i += 2; continue
            if c == in_s: in_s = None
            i += 1; continue
        if c in "\"'`": in_s = c; i += 1; continue
        if cs and src.startswith("//", i):
            j = src.find("\n", i); j = n if j < 0 else j
            for k in range(i, j): out[k] = " "
            i = j; continue
        if cs and (src.startswith("/*", i) or src.startswith("{/*", i)):
            j = src.find("*/", i + 2); j = n if j < 0 else j + 2
            for k in range(i, j):
                if src[k] != "\n": out[k] = " "
            i = j; continue
        i += 1
    return "".join(out)

# Files whose matches are known not to be Hinglish.
ALLOW = (
    # The schema's own SQL comments. They sit inside C# verbatim strings, so
    # the comment stripper cannot see them, and no one reads them but us.
    "backend/Program.cs",
    # District names: "Agar Malwa", "Bara Banki", "Hamirpur".
    "frontend/lib/indianLocations.ts",
)

seen = set()
hits = []
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in files:
        if not f.endswith((".tsx", ".ts", ".cs")) or f.endswith(".d.ts"): continue
        path = os.path.join(base, f); rel = os.path.relpath(path, ROOT)
        if any(rel.replace("\\\\", "/").startswith(a) for a in ALLOW): continue
        try: src = io.open(path, encoding="utf-8", errors="replace").read()
        except Exception: continue
        clean = strip_comments(src, True)
        for ln, line in enumerate(clean.split("\n"), 1):
            if not line.strip(): continue
            deva = RE_DEVA.search(line)
            if not (RE_WORD.search(line) or deva): continue
            # Devanagari skips the context filter. The filter looks for things
            # like `>Text` and only matches A-Z, so JSX text in Hindi slipped
            # straight through it - which a probe caught. Outside a comment
            # there is no innocent reason for Devanagari in this codebase, so
            # it is reported wherever it appears.
            if not deva and not VISIBLE.search(line): continue
            orig = src.split("\n")[ln - 1].strip()
            key = (rel, ln)
            if key in seen: continue
            seen.add(key)
            hits.append({"file": rel, "line": ln,
                         "words": sorted({w.lower() for w in RE_WORD.findall(line)}),
                         "text": orig[:180]})

if not hits:
    print("check-english: every string a person reads is in English")
    sys.exit(0)

print(f"check-english: {len(hits)} line(s) are not in English\n")
for h in hits:
    print(f"  {h['file']}:{h['line']}  ({', '.join(h['words']) or 'Devanagari'})")
    print(f"      {h['text']}")
print("\nComments are fine in any language. This is about what a person reads.")
sys.exit(1)
