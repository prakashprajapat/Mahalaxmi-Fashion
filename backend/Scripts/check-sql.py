#!/usr/bin/env python3
"""Catches user input concatenated into a SQL string instead of parameterised.

Why a script and not just care: these two lines are one character apart and
only one of them is safe.

    await _db.Database.ExecuteSqlInterpolatedAsync($"... WHERE id = {id}")
    await _db.Database.ExecuteSqlRawAsync($"... WHERE id = {id}")

The first one does NOT paste `id` into the query. EF Core takes the
FormattableString, replaces each hole with a real placeholder, and sends the
value separately - so an `id` of `1; DROP TABLE orders` arrives at Postgres as
the literal text of an id that does not exist, and matches nothing. The second
one builds the string in C# first and hands the finished text over, so that
same `id` arrives as SQL and runs.

Both compile. Both read the same at a glance. The difference is a word in the
middle of a long method name, in a file nobody is reading closely at five in
the evening. That is exactly the kind of thing worth having a machine check.

Every raw SQL call in this project is currently safe - every one of them takes
a string literal, and every dynamic value goes through an Interpolated method.
This script exists so that stays true after the next edit.

Checks, in order of how badly they bite:

  1. An INTERPOLATED string handed to a Raw method. Injectable, always.
  2. A VARIABLE handed to a Raw method. Might be a constant, might be built
     from a request two files away; it cannot be judged from here, so it has
     to be looked at.
  3. SQL text concatenated with + onto something that is not a literal.

Usage: check-sql.py <files...>   (exit 1 if anything is flagged)
"""
import re
import sys

# The methods that send their argument to the database AS TEXT. Everything
# named *Interpolated*, plus Database.SqlQuery<T>, takes a FormattableString
# and parameterises it, so those are the safe spellings and are not listed.
RAW_CALLS = re.compile(r"\b("
                       r"ExecuteSqlRaw|ExecuteSqlRawAsync|"
                       r"FromSqlRaw|SqlQueryRaw"
                       r")\s*(?:<[^>()]*>)?\s*\(")

# A line that is SQL text being joined to something else with +.
CONCAT = re.compile(r'"[^"]*\b(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|VALUES|ORDER BY|SET)\b[^"]*"\s*\+')

SQL_WORD = re.compile(r"\b(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|VALUES|SET|ORDER BY|DROP|CREATE|ALTER)\b",
                      re.IGNORECASE)


def first_argument(text, open_paren):
    """The first few characters of the first argument, skipping whitespace,
    comments and newlines, so a call whose string starts on the next line is
    read the same as one that does not."""
    i = open_paren + 1
    n = len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n":
            i += 1
            continue
        if text.startswith("//", i):                 # a line comment between
            j = text.find("\n", i)                   # the paren and the string
            if j == -1:
                return ""
            i = j + 1
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i)
            if j == -1:
                return ""
            i = j + 2
            continue
        return text[i:i + 3]
    return ""


def check(path):
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except (OSError, UnicodeDecodeError) as exc:
        return [(0, "unreadable", str(exc))]

    # Line number for an offset, without building a list per lookup.
    starts = [0]
    for m in re.finditer("\n", text):
        starts.append(m.end())

    def line_of(offset):
        lo, hi = 0, len(starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if starts[mid] <= offset:
                lo = mid
            else:
                hi = mid - 1
        return lo + 1

    found = []

    for m in RAW_CALLS.finditer(text):
        method = m.group(1)
        arg = first_argument(text, m.end() - 1)
        line = line_of(m.start())

        if arg.startswith('$"') or arg.startswith('$@"') or arg.startswith('@$"'):
            found.append((line, "INTERPOLATED-INTO-RAW",
                          f"{method} is given an interpolated string. The values are pasted "
                          f"into the SQL text. Use the Interpolated version of this method, "
                          f"which parameterises them."))
        elif arg.startswith('"') or arg.startswith('@"'):
            pass                                      # a literal: nothing to inject
        elif arg == "":
            found.append((line, "UNREADABLE-CALL",
                          f"{method}: could not find its first argument. Check it by hand."))
        else:
            found.append((line, "VARIABLE-INTO-RAW",
                          f"{method} is given a variable rather than a literal. If any part of "
                          f"it came from a request, it is injectable. Check it, or build the "
                          f"query with the Interpolated version."))

    for m in CONCAT.finditer(text):
        tail = text[m.end():m.end() + 40].lstrip()
        if tail.startswith('"') or tail.startswith('@"') or tail.startswith('$"'):
            continue                                  # literal + literal is just formatting
        found.append((line_of(m.start()), "SQL-CONCAT",
                      "SQL text joined with + onto something that is not a literal."))

    return found


def main(argv):
    files = [a for a in argv if a.endswith(".cs")]
    if not files:
        print("check-sql: no .cs files given")
        return 1

    total = 0
    for path in sorted(files):
        for line, kind, why in check(path):
            total += 1
            print(f"{path}:{line}: {kind}: {why}")

    if total:
        print(f"\ncheck-sql: {total} place(s) where input could reach SQL as code")
        return 1

    print(f"check-sql: {len(files)} files, every raw query is a literal")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
