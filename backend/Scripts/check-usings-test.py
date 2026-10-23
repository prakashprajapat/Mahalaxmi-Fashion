#!/usr/bin/env python3
# Fixtures for check-usings.py.
#
# The checker exists because the real compiler lives on the VPS and only runs
# after the pull. That makes a FALSE ALARM here expensive in its own way: it
# would block a good deploy and, worse, teach everyone to run the checkers and
# ignore them. So the "must stay quiet" half below is the longer half.
import importlib.util, os, sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cu", os.path.join(here, "check-usings.py"))
cu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cu)

passed = failed = 0
def expect_caught(name, src):
    global passed, failed
    got = cu.analyse("fixture.cs", src)
    if got: passed += 1
    else:
        failed += 1
        print("FAIL (should have been caught) %s" % name)

def expect_quiet(name, src):
    global passed, failed
    got = cu.analyse("fixture.cs", src)
    if not got: passed += 1
    else:
        failed += 1
        print("FAIL (false alarm) %s\n    %s" % (name, got))

HEAD = "using Microsoft.AspNetCore.Mvc;\nnamespace MahalaxmiApi.Controllers;\n"

# ── Must be caught ──────────────────────────────────────────────────────────

# The exact shape that broke the 23 Oct deploy.
expect_caught("the real one: attribute, no using", HEAD + """
public class C : ControllerBase
{
    [HttpGet("x")]
    [EnableRateLimiting("events")]
    public IActionResult X() => Ok();
}
""")

expect_caught("DisableRateLimiting, same namespace", HEAD + """
public class C { [DisableRateLimiting] public void X() {} }
""")

expect_caught("Authorize without its using", """
using Microsoft.AspNetCore.Mvc;
namespace MahalaxmiApi.Controllers;
public class C { [Authorize] public void X() {} }
""")

expect_caught("JsonSerializer without System.Text.Json", HEAD + """
public class C { public string X(object o) => JsonSerializer.Serialize(o); }
""")

expect_caught("our own RequireOwner without MahalaxmiApi.Authorization", HEAD + """
public class C { [RequireOwner] public void X() {} }
""")

expect_caught("an extension method with no using to make it exist", HEAD + """
public class C { public bool X(System.Security.Claims.ClaimsPrincipal u) => u.IsOwner(); }
""")

expect_caught("FindFirstValue without System.Security.Claims", HEAD + """
public class C { public string X(dynamic u) => u.FindFirstValue("sub"); }
""")

expect_caught("a type used as a field, not called", HEAD + """
public class C { private readonly IMemoryCache _cache; }
""")

# ── Must stay quiet ─────────────────────────────────────────────────────────

expect_quiet("the fix: attribute WITH its using", """
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace MahalaxmiApi.Controllers;
public class C { [EnableRateLimiting("events")] public void X() {} }
""")

expect_quiet("written out in full needs no using", HEAD + """
public class C { [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("events")] public void X() {} }
""")

expect_quiet("named only in a comment", HEAD + """
public class C {
    // TODO: put [EnableRateLimiting("events")] on this one too.
    public void X() {}
}
""")

expect_quiet("named only inside a string", HEAD + """
public class C { public string X() => "add [EnableRateLimiting] here"; }
""")

expect_quiet("named inside a VERBATIM string, which is how the SQL is written", HEAD + '''
public class C {
    public string Sql() => @"SELECT 1 -- EnableRateLimiting JsonSerializer Regex
                             FROM t";
}
''')

expect_quiet("a doubled quote inside a verbatim string does not end it", HEAD + '''
public class C {
    public string Sql() => @"SELECT ""EnableRateLimiting"" FROM t WHERE x = 1";
}
''')

expect_quiet("an escaped quote in a normal string does not end it", HEAD + r'''
public class C { public string X() => "he said \"EnableRateLimiting\" loudly"; }
''')

expect_quiet("a block comment", HEAD + """
public class C {
    /* EnableRateLimiting and JsonSerializer and IMemoryCache, all in prose */
    public void X() {}
}
""")

expect_quiet("a type from ImplicitUsings is never asked for", HEAD + """
public class C { public void X() { var l = new List<string>(); Console.WriteLine(l.Count); } }
""")

expect_quiet("a file in MahalaxmiApi.Authorization sees its own namespace", """
namespace MahalaxmiApi.Authorization;
public sealed class RequireOwnerAttribute { }
public static class SectionAccess { }
""")

expect_quiet("a word that merely CONTAINS a known name", HEAD + """
public class C { private int MyRegexCounter; public void X() { MyRegexCounter++; } }
""")

expect_quiet("a real controller shape with everything imported", """
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using MahalaxmiApi.Data;
using MahalaxmiApi.Authorization;
namespace MahalaxmiApi.Controllers;

[ApiController]
public class OrdersLike : ControllerBase
{
    private readonly AppDbContext _db;
    public OrdersLike(AppDbContext db) { _db = db; }

    [HttpGet("{id}")]
    [Authorize]
    [RequirePerm("orders")]
    [EnableRateLimiting("events")]
    public async Task<IActionResult> Get(string id)
    {
        var who = User.FindFirstValue("sub");
        var row = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == id);
        return Ok(JsonSerializer.Serialize(new { who, row }));
    }
}
""")

print("\n%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
