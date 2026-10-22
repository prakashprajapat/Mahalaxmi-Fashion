#!/usr/bin/env bash
# All three C# checkers over every .cs file, in one command.
#
# There is no C# compiler on the machine this code is written from, so these
# scripts are the only thing standing between a typo and a failed deploy
# on the server. Running one of them and not the others is how a SQL comment
# containing a double quote reached production: it ended the verbatim string
# it was sitting inside, the brackets still balanced, and the bracket checker
# said OK. Run this, not any script on its own.
#
# check-sql is the third, and it is here for the same reason rather than as a
# separate habit: ExecuteSqlRaw($"..") and ExecuteSqlInterpolated($"..") look
# alike and only one of them parameterises its values, so the difference
# between a safe query and an injectable one is a word in the middle of a long
# method name. A machine should be the one reading for it.
set -u
cd "$(dirname "$0")/../.." || exit 1
files=$(git ls-files 'backend/**/*.cs')
[ -z "$files" ] && { echo "no .cs files found"; exit 1; }

echo "--- strings ---"
python3 -I backend/Scripts/check-cs-strings.py $files; s=$?
echo "--- brackets ---"
python3 -I backend/Scripts/check-cs-brackets.py $files | grep -v '^OK ' ; b=${PIPESTATUS[0]}
[ "$b" -eq 0 ] && echo "all balanced"
echo "--- sql ---"
python3 -I backend/Scripts/check-sql.py $files; q=$?

if [ "$s" -ne 0 ] || [ "$b" -ne 0 ] || [ "$q" -ne 0 ]; then
  echo; echo "NOT SAFE TO PUSH"; exit 1
fi
echo; echo "all three checkers clean"
