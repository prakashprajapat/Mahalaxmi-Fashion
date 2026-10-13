#!/usr/bin/env bash
# Both C# checkers over every .cs file, in one command.
#
# There is no C# compiler on the machine this code is written from, so these
# two scripts are the only thing standing between a typo and a failed deploy
# on the server. Running one of them and not the other is how a SQL comment
# containing a double quote reached production: it ended the verbatim string
# it was sitting inside, the brackets still balanced, and the bracket checker
# said OK. Run this, not either script on its own.
set -u
cd "$(dirname "$0")/../.." || exit 1
files=$(git ls-files 'backend/**/*.cs')
[ -z "$files" ] && { echo "no .cs files found"; exit 1; }

echo "--- strings ---"
python3 -I backend/Scripts/check-cs-strings.py $files; s=$?
echo "--- brackets ---"
python3 -I backend/Scripts/check-cs-brackets.py $files | grep -v '^OK ' ; b=${PIPESTATUS[0]}
[ "$b" -eq 0 ] && echo "all balanced"

if [ "$s" -ne 0 ] || [ "$b" -ne 0 ]; then
  echo; echo "NOT SAFE TO PUSH"; exit 1
fi
echo; echo "both checkers clean"
