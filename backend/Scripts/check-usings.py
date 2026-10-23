#!/usr/bin/env python3
# ---------------------------------------------------------------------------
# Does every type this file names have a using that brings it in?
#
# Why this exists: deploy on 23 Oct died at step 4 with
#
#   OrdersController.cs(445,6): error CS0246: The type or namespace name
#   'EnableRateLimitingAttribute' could not be found
#
# [EnableRateLimiting("events")] had been added to three methods and
# `using Microsoft.AspNetCore.RateLimiting;` had not. The other four checkers
# all passed: the brackets balanced, the strings closed, the SQL was literal
# and the schema was additive. A missing using is invisible to every one of
# them, and without a C# compiler on the machine that wrote the code, the
# first thing that notices is the VPS - after the pull, mid-deploy.
#
# This cannot replace a compiler. It checks ONE thing, the thing that actually
# went wrong: a known type used in a file that does not import its namespace.
# The map below is deliberately small and hand-kept. A name not in it is not
# checked, which is the right failure: silence, never a false alarm that
# teaches people to ignore the output.
# ---------------------------------------------------------------------------
import os, re, subprocess, sys

# Namespaces the SDK adds to every file in a web project (ImplicitUsings).
# Nothing from these needs a using, so nothing from them belongs below.
IMPLICIT = {
    "System", "System.Collections.Generic", "System.IO", "System.Linq",
    "System.Net.Http", "System.Net.Http.Json", "System.Threading",
    "System.Threading.Tasks", "Microsoft.AspNetCore.Builder",
    "Microsoft.AspNetCore.Hosting", "Microsoft.AspNetCore.Http",
    "Microsoft.AspNetCore.Routing", "Microsoft.Extensions.Configuration",
    "Microsoft.Extensions.DependencyInjection", "Microsoft.Extensions.Hosting",
    "Microsoft.Extensions.Logging",
}

# type name -> the namespace that declares it.
NEEDS = {
    # The one that broke the deploy, and its pair.
    "EnableRateLimiting":       "Microsoft.AspNetCore.RateLimiting",
    "DisableRateLimiting":      "Microsoft.AspNetCore.RateLimiting",
    "EnableRateLimitingAttribute":  "Microsoft.AspNetCore.RateLimiting",
    "DisableRateLimitingAttribute": "Microsoft.AspNetCore.RateLimiting",

    "Authorize":                "Microsoft.AspNetCore.Authorization",
    "AllowAnonymous":           "Microsoft.AspNetCore.Authorization",
    "IAuthorizationFilter":     "Microsoft.AspNetCore.Mvc.Filters",
    "AuthorizationFilterContext": "Microsoft.AspNetCore.Mvc.Filters",

    "ClaimsPrincipal":          "System.Security.Claims",
    "ClaimTypes":               "System.Security.Claims",
    "Claim":                    "System.Security.Claims",

    "JsonSerializer":           "System.Text.Json",
    "JsonElement":              "System.Text.Json",
    "JsonDocument":             "System.Text.Json",
    "JsonValueKind":            "System.Text.Json",
    "JsonSerializerOptions":    "System.Text.Json",
    "JsonNode":                 "System.Text.Json.Nodes",
    "JsonObject":               "System.Text.Json.Nodes",
    "JsonArray":                "System.Text.Json.Nodes",

    "Regex":                    "System.Text.RegularExpressions",
    "RegexOptions":             "System.Text.RegularExpressions",
    "Encoding":                 "System.Text",
    "StringBuilder":            "System.Text",
    "NumberStyles":             "System.Globalization",
    "CultureInfo":              "System.Globalization",
    "CryptographicOperations":  "System.Security.Cryptography",
    "RandomNumberGenerator":    "System.Security.Cryptography",

    "IMemoryCache":             "Microsoft.Extensions.Caching.Memory",
    "MemoryCacheEntryOptions":  "Microsoft.Extensions.Caching.Memory",

    # Ours.
    "RequirePerm":              "MahalaxmiApi.Authorization",
    "RequirePermAttribute":     "MahalaxmiApi.Authorization",
    "RequireOwner":             "MahalaxmiApi.Authorization",
    "RequireOwnerAttribute":    "MahalaxmiApi.Authorization",
    "SectionAccess":            "MahalaxmiApi.Authorization",
    "AppDbContext":             "MahalaxmiApi.Data",
}

# Methods that only exist as extensions, so the using is what makes them
# compile even though no type name appears at the call site. This is the
# quieter half of the same mistake.
EXTENSIONS = {
    "HasSectionAccess":         "MahalaxmiApi.Authorization",
    "IsOwner":                  "MahalaxmiApi.Authorization",
    "FindFirstValue":           "System.Security.Claims",
    "ExecuteSqlInterpolatedAsync": "Microsoft.EntityFrameworkCore",
    "ExecuteSqlRawAsync":       "Microsoft.EntityFrameworkCore",
    "FromSqlInterpolated":      "Microsoft.EntityFrameworkCore",
    "ToListAsync":              "Microsoft.EntityFrameworkCore",
    "FirstOrDefaultAsync":      "Microsoft.EntityFrameworkCore",
    "AnyAsync":                 "Microsoft.EntityFrameworkCore",
    "CountAsync":               "Microsoft.EntityFrameworkCore",
}

COMMENT = re.compile(r"//.*$")

def strip_noise(src):
    """Comments and string bodies out, so a namespace named in prose or a type
    named inside a SQL literal is not read as a use of it."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == '"':
            verbatim = i > 0 and src[i - 1] == '@'
            out.append(' ')
            i += 1
            while i < n:
                if verbatim:
                    if src[i] == '"':
                        if i + 1 < n and src[i + 1] == '"':
                            i += 2; continue
                        i += 1; break
                else:
                    if src[i] == '\\':
                        i += 2; continue
                    if src[i] == '"':
                        i += 1; break
                    if src[i] == '\n':
                        break
                i += 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            while i < n and src[i] != '\n':
                i += 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            i += 2
            while i + 1 < n and not (src[i] == '*' and src[i + 1] == '/'):
                i += 1
            i += 2
            continue
        out.append(c)
        i += 1
    return ''.join(out)

def analyse(rel, raw):
    """Everything this file names but does not import. Split out of main() so
    the fixtures in check-usings-test.py can hand it source directly - a
    checker nobody has watched fail is not a checker."""
    problems = []
    code = strip_noise(raw)

    # Every namespace in scope: the file's own usings, its own namespace
    # declaration and that declaration's parents, plus whatever the SDK adds.
    have = set(IMPLICIT)
    for m in re.finditer(r"^\s*(?:global\s+)?using\s+(?:static\s+)?([A-Za-z0-9_.]+)\s*;",
                         code, re.M):
        have.add(m.group(1))
    for m in re.finditer(r"^\s*namespace\s+([A-Za-z0-9_.]+)", code, re.M):
        ns = m.group(1)
        have.add(ns)
        parts = ns.split(".")
        for k in range(1, len(parts)):
            have.add(".".join(parts[:k]))

    for name, ns in NEEDS.items():
        used = re.search(r"\[\s*%s\b" % re.escape(name), code) \
            or re.search(r"\b%s\s*[.(<]" % re.escape(name), code) \
            or re.search(r"\b%s\s+[A-Za-z_]" % re.escape(name), code)
        if not used:
            continue
        # Written out in full needs no using.
        if re.search(r"%s\s*\.\s*%s\b" % (re.escape(ns), re.escape(name)), code):
            continue
        if ns not in have:
            line = code[:used.start()].count("\n") + 1
            problems.append("%s:%d: uses %s but does not import %s"
                            % (rel, line, name, ns))

    for name, ns in EXTENSIONS.items():
        m = re.search(r"\.\s*%s\s*[(<]" % re.escape(name), code)
        if not m:
            continue
        if ns not in have:
            line = code[:m.start()].count("\n") + 1
            problems.append("%s:%d: calls .%s() but does not import %s"
                            % (rel, line, name, ns))

    return problems


def main():
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                          capture_output=True, text=True).stdout.strip()
    listed = subprocess.run(["git", "ls-files", "backend/*.cs", "backend/**/*.cs"],
                            capture_output=True, text=True, cwd=root).stdout.split()
    files = sorted(set(listed))

    problems = []
    for rel in files:
        path = os.path.join(root, rel)
        try:
            raw = open(path, encoding="utf-8").read()
        except Exception as e:
            problems.append("%s: could not read (%s)" % (rel, e))
            continue
        problems.extend(analyse(rel, raw))

    if problems:
        print("check-usings: %d file(s) name a type they do not import" % len(problems))
        for p in problems:
            print("  " + p)
        return 1

    print("check-usings: %d files, every known type has its using" % len(files))
    return 0

if __name__ == "__main__":
    sys.exit(main())
