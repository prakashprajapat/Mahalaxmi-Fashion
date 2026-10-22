#!/usr/bin/env python3
"""Catches schema changes that break a deploy where two versions run at once.

During a zero-downtime switch the old version and the new one are both serving
for a few seconds, against ONE database. The new version runs its schema
changes at boot - while the old one is still answering shoppers. So the
question for every DDL statement is not "does this work" but "does the OTHER
version survive it".

Adding things is safe: a column the old code does not know about costs it
nothing. Taking things away is not, and neither is tightening them:

    DROP COLUMN          the old version is still SELECTing it -> 42703
    RENAME               the same, with a confusing error
    DROP TABLE           the same, worse
    ADD COLUMN NOT NULL  the old version INSERTs without it -> 23502
    SET NOT NULL         the same
    ALTER COLUMN TYPE    both versions must agree on the type, and one does not

The way round all of them is the same and has a name: expand, then contract.
Ship the addition in one release, change the code to stop using the old thing
in the next, and only remove it in a third - by which time no running version
remembers it. Slower, and it is the difference between a deploy and an outage.

Every statement in this project is already expand-only. This keeps it that way,
and is the reason the deploy script can put two versions side by side at all.

If a contract step IS deliberate - the column really is unused by every version
that could still be running - say so on the line:

    DROP COLUMN old_price;   -- rolling-deploy: safe, unused since v2.3

Usage: check-migrations.py <files...>   (exit 1 if anything is flagged)
"""
import re
import sys

OPT_OUT = "rolling-deploy:"

RULES = [
    (re.compile(r"\bDROP\s+COLUMN\b", re.I),
     "DROP COLUMN: the version still serving is selecting it."),
    (re.compile(r"\bALTER\s+TABLE\b[^;]*\bRENAME\b", re.I | re.S),
     "RENAME: the version still serving knows the old name."),
    (re.compile(r"\bDROP\s+TABLE\b", re.I),
     "DROP TABLE: the version still serving is reading it."),
    (re.compile(r"\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b", re.I | re.S),
     "SET NOT NULL: the version still serving inserts rows without it."),
    (re.compile(r"\bALTER\s+COLUMN\b[^;]*\bTYPE\b", re.I | re.S),
     "ALTER COLUMN TYPE: the two versions would disagree about the type."),
    (re.compile(r"\bDROP\s+CONSTRAINT\b", re.I),
     "DROP CONSTRAINT: check it is not one the serving version relies on."),
    (re.compile(r"\bDROP\s+(?:INDEX|SEQUENCE)\b", re.I),
     "DROP: the version still serving may depend on it."),
]

# ADD COLUMN ... NOT NULL is only a problem WITHOUT a default: with one,
# Postgres fills existing rows and the old version's inserts are fine.
ADD_NOT_NULL = re.compile(r"\bADD\s+COLUMN\b(?:\s+IF\s+NOT\s+EXISTS)?\s+[^;]*?\bNOT\s+NULL\b([^;]*)", re.I | re.S)


def statements(text):
    """Every SQL-looking statement, with the line its first word is on. Crude
    on purpose: it only has to find the keywords, not parse SQL.

    A statement runs to the END OF THE LINE its semicolon is on, not to the
    semicolon. The opt-out marker is written where a person naturally writes
    it - after the statement, on the same line - and cutting at the semicolon
    put that comment in the NEXT chunk, so the marker was read against the
    wrong statement and never excused the one it was written for.
    """
    out = []
    pos = 0
    n = len(text)
    while pos < n:
        semi = text.find(";", pos)
        if semi == -1:
            chunk_end = n
        else:
            nl = text.find("\n", semi)
            chunk_end = n if nl == -1 else nl
        chunk = text[pos:chunk_end]
        if chunk.strip():
            # The line the first real character sits on, so the report points
            # at the statement rather than at the blank line above it.
            lead = len(chunk) - len(chunk.lstrip("\r\n \t"))
            out.append((text.count("\n", 0, pos + lead) + 1, chunk))
        pos = chunk_end + 1
    return out


def check(path):
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except (OSError, UnicodeDecodeError) as exc:
        return [(0, f"unreadable: {exc}")]

    found = []
    for at, stmt in statements(text):
        if OPT_OUT in stmt:
            continue

        for pattern, why in RULES:
            if pattern.search(stmt):
                found.append((at, why))

        m = ADD_NOT_NULL.search(stmt)
        if m and not re.search(r"\bDEFAULT\b", m.group(0), re.I):
            found.append((at, "ADD COLUMN NOT NULL with no DEFAULT: existing rows have nothing "
                              "to put there, and the version still serving inserts without it."))

    return found


def main(argv):
    files = [a for a in argv if a.endswith((".cs", ".sql"))]
    if not files:
        print("check-migrations: no .cs or .sql files given")
        return 1

    total = 0
    for path in sorted(files):
        for line, why in check(path):
            total += 1
            print(f"{path}:{line}: ROLLING-DEPLOY: {why}")

    if total:
        print(f"\ncheck-migrations: {total} change(s) that the version still serving would not survive.")
        print("Expand now, contract in a later release - or mark the line "
              "'-- rolling-deploy: <why it is safe>'.")
        return 1

    print(f"check-migrations: {len(files)} files, every schema change is additive")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
