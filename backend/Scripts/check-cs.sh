#!/usr/bin/env bash
# Every checker over every file, in one command.
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
#
# check-migrations is the fourth. The deploy now runs two versions of the API
# side by side for a few seconds, so a schema change has to be survivable by
# the version that is still serving while the new one applies it. Adding is;
# dropping, renaming and tightening are not.
set -u
cd "$(dirname "$0")/../.." || exit 1
# Both patterns, and this is not belt and braces.
#
# 'backend/**/*.cs' needs at least one directory level, so for a year it matched
# every file under Controllers/, Services/, Models/ - and silently missed the one
# .cs file sitting at the top of backend/. That file is Program.cs: the largest in
# the project, holding every startup CREATE TABLE and ALTER TABLE, and the file
# whose unbalanced verbatim string is the whole reason the comment above exists.
# The checkers said "clean" on 104 files and had never once read it.
files=$(git ls-files 'backend/*.cs' 'backend/**/*.cs' | sort -u)
[ -z "$files" ] && { echo "no .cs files found"; exit 1; }
echo "checking $(echo "$files" | wc -l) files"


echo "--- strings ---"
python3 -I backend/Scripts/check-cs-strings.py $files; s=$?
echo "--- brackets ---"
python3 -I backend/Scripts/check-cs-brackets.py $files | grep -v '^OK ' ; b=${PIPESTATUS[0]}
[ "$b" -eq 0 ] && echo "all balanced"
echo "--- sql ---"
python3 -I backend/Scripts/check-sql.py $files; q=$?
echo "--- migrations ---"
# Also the .sql files, because the schema is written in both places: the
# startup block in Program.cs and database/*.sql.
python3 -I backend/Scripts/check-migrations.py $files $(git ls-files 'database/*.sql'); m=$?

if [ "$s" -ne 0 ] || [ "$b" -ne 0 ] || [ "$q" -ne 0 ] || [ "$m" -ne 0 ]; then
  echo; echo "NOT SAFE TO PUSH"; exit 1
fi
echo; echo "all four checkers clean"
