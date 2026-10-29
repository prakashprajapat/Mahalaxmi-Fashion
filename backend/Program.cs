using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using MahalaxmiApi.Authorization;
using MahalaxmiApi.Data;
using MahalaxmiApi.Middleware;
using MahalaxmiApi.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──────────────────────────────────────────────────────────────────
//
// Which ROLE the app connects as, which decides what a query can do if one ever
// gets through that should not have.
//
// Every query in this project is parameterised and none of them can be injected
// - checked line by line, and backend/Scripts/check-sql.py now keeps it that
// way. That stops input becoming SQL. It does not limit what SQL can do, and
// this connection was the cluster SUPERUSER, where SQL is not limited to the
// data: COPY ... TO PROGRAM runs a shell command on the VPS, pg_authid holds
// every password hash, and DROP DATABASE is one statement. An injection against
// a superuser connection is not a data breach, it is a shell on the server.
//
// Set APP_DB_USER and APP_DB_PASSWORD and it connects as that role instead.
// Both must be present: half a credential would silently fall back to the
// superuser, which is the one outcome worth nobody's time. See
// database/least-privilege.sql for the role, and the warning further down for
// what gets said while this is still unset.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
var appDbUser = (builder.Configuration["APP_DB_USER"] ?? "").Trim();
var appDbPassword = builder.Configuration["APP_DB_PASSWORD"] ?? "";

// Rebuilt through Npgsql rather than by editing the string, so a password
// containing a semicolon or an equals sign cannot break the parse - or quietly
// change which host is connected to.
var csb = new Npgsql.NpgsqlConnectionStringBuilder(connectionString);

if (appDbUser.Length > 0 && appDbPassword.Length > 0)
{
    csb.Username = appDbUser;
    csb.Password = appDbPassword;
}

// ── How many connections this process may hold ───────────────────────────────
//
// Npgsql pools by default and the default ceiling is 100 PER PROCESS. Postgres
// defaults to max_connections = 100 for the whole server, and it spends real
// memory on each one because every connection is its own process - which is
// the wall Instagram hit before they put PgBouncer in front.
//
// One API process could therefore take the entire server's allowance on its
// own. And since the zero-downtime deploy, there are deliberately TWO API
// processes alive at once during a switch: two pools, 200 connections between
// them, against a ceiling of 100. Nothing has gone wrong yet only because at
// this shop's traffic neither pool grows anywhere near its limit - the fault
// would appear the first busy evening somebody deploys, which is exactly when
// nobody wants to be reading connection errors.
//
// So each process is bounded, and the sum is what has to fit. Note the real
// budget is not 100: superuser_reserved_connections defaults to 3, which an
// ordinary role cannot touch - and once the app connects as mfh_app rather
// than postgres, that reservation applies to it. Measured on a test server:
// with max_connections = 20, the 21st connection is refused outright with
// "FATAL: sorry, too many clients already".
//
//     2 slots x 40 = 80, out of ~97 usable, leaving room for psql, pg_dump
//     and the nightly backup
//
// Raise DB_MAX_POOL alongside max_connections, never on its own. A pool larger
// than the server allows does not buy throughput, it buys a queue of requests
// that each wait and then fail.
//
// An explicit value already in the connection string wins - this only fills in
// a default where none was chosen.
if (!connectionString!.Contains("Maximum Pool Size", StringComparison.OrdinalIgnoreCase)
    && !connectionString.Contains("MaxPoolSize", StringComparison.OrdinalIgnoreCase))
{
    csb.MaxPoolSize = builder.Configuration.GetValue("DB_MAX_POOL", 40);
    csb.MinPoolSize = 0;

    // Hand an idle connection back rather than sitting on it. The standby slot
    // after a deploy is idle for days; without this it would keep whatever it
    // opened at boot for as long as it lives.
    csb.ConnectionIdleLifetime = 60;

    // Fail fast rather than hang. Without these a server that has run out of
    // connections, or a query that will never finish, holds a request open
    // until the browser gives up - and the shopper sees a page that spins
    // instead of a page that says something went wrong.
    if (csb.Timeout == 15) csb.Timeout = 10;          // 15 is Npgsql's default
    if (csb.CommandTimeout == 30) csb.CommandTimeout = 30;
}

connectionString = csb.ConnectionString;

builder.Services.AddDbContext<AppDbContext>(opt => opt.UseNpgsql(connectionString));

// ── Services ──────────────────────────────────────────────────────────────────
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<SmsService>();
builder.Services.AddScoped<DelhiveryService>();
builder.Services.AddScoped<AdminNotifier>();
builder.Services.AddScoped<WalletService>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<FeatureFlags>();
// Every one of these had the framework default, which is ONE HUNDRED SECONDS.
//
// That is the shape of bottleneck worth worrying about here. A courier or a
// payment provider does not usually fail outright - it goes slow. With no
// timeout, each waiting call holds a thread and a connection for a minute and
// a half, the thread pool fills with requests that are not doing anything, and
// the shop stops answering for everybody. The outage then looks like our fault
// and the cause is somebody else's bad afternoon.
//
// Numbers chosen by what the caller is waiting for: a shopper staring at a
// checkout button will not wait twenty seconds either way, and a background
// sync nobody is watching should still not be allowed to pile up.
static void Upstream(IHttpClientBuilder b, int seconds) =>
    b.ConfigureHttpClient(c => c.Timeout = TimeSpan.FromSeconds(seconds));

Upstream(builder.Services.AddHttpClient("razorpay"), 20);   // a customer is waiting
Upstream(builder.Services.AddHttpClient("cashfree"), 20);   // a customer is waiting
Upstream(builder.Services.AddHttpClient("delhivery"), 30);  // AWB generation is genuinely slow
Upstream(builder.Services.AddHttpClient("instagram"), 15);  // nobody is waiting
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddMemoryCache(); // PERF-2: for settings caching

// Auto-deletes rejected return media after its 30-day retention window.
builder.Services.AddHostedService<ReturnMediaCleanupService>();
// Har paanch minute me database aur disk dekhta hai, aur deploy ke rollback ka
// nishan bhi. Ye server ke ANDAR chalta hai, isliye "server hi band hai" wala
// alert ye nahi bhej sakta - uske liye bahar wali uptime service hai. Dekhiye
// HealthWatchdogService ki tippani.
builder.Services.AddHostedService<HealthWatchdogService>();
builder.Services.AddHostedService<DelhiveryTrackingSyncService>();

// Re-checks every product against the quality gate once an hour: anything on
// the website that would be refused by Google goes back to draft, anything
// held as a draft that now passes goes back on the website. The gate already
// runs at save time; this is what catches products that went live before it
// existed, and ones that stop passing later.
builder.Services.AddHostedService<ProductGateSweepService>();

// Turns delivered parcels into money owed to the shop that supplied them. A
// sweep rather than a hook on delivery, because three different paths mark an
// order delivered and bookkeeping wired into all three is bookkeeping missing
// from one of them.
builder.Services.AddHostedService<StaffPayoutSweepService>();
builder.Services.AddHostedService<ReviewRequestService>();
builder.Services.AddHostedService<AbandonedCartService>();

// Pulls the shop's own reels off Instagram every six hours and keeps the
// homepage strip filled. Singleton as well as a hosted service so the admin
// screen's "Fetch now" button runs the same code the background job runs,
// rather than a second path that drifts away from it.
builder.Services.AddSingleton<InstagramSyncService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<InstagramSyncService>());

// Emails the database and the day's new photos every night at 11:59 PM IST.
// Registered as a singleton as well as a hosted service so the admin
// "Run backup now" button can call exactly the same code path.
builder.Services.AddSingleton<BackupService>();
builder.Services.AddSingleton<AttemptLimiter>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<BackupService>());

// Return-media uploads: allow videos up to ~80 MB per file (Kestrel + multipart limits)
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
{
    o.MultipartBodyLengthLimit = 85L * 1024 * 1024;
});
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 85L * 1024 * 1024);

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// SEC-8: Protect auth & OTP endpoints from brute-force (10 req/min)
// The caller's real address. The site sits behind Cloudflare and nginx, so
// RemoteIpAddress is the proxy, not the shopper — without this every customer
// in India would count as one caller and share one budget.
// Who a request is from, for the purpose of counting it.
//
// This is the name every rate limit is kept under, so whoever gets to choose it
// gets to decide how many times they may try. It used to be chosen by the
// caller: CF-Connecting-IP was believed whatever it said and wherever it came
// from, so a fresh value on each request meant a fresh allowance, and the limit
// on password guesses and OTP sends counted nothing.
//
// A forwarded header is worth something only when the machine that set it can
// be trusted, and only the machine on the other end of the socket can be
// checked. Here that is nginx, on this same host, reaching the API through the
// Docker bridge. So: a header is read only when the connection came from this
// machine, and is ignored entirely otherwise - a request that reaches the port
// from anywhere else is counted under the address it actually came from, which
// it cannot rewrite.
//
// The value is true and not merely trusted because nginx sets it from the
// connection rather than passing the visitor's copy through: 21 Cloudflare
// ranges in set_real_ip_from, real_ip_header CF-Connecting-IP, and
// proxy_set_header CF-Connecting-IP $remote_addr in every proxying location.
// See RUNBOOK-PENDING.md ("Real client IP"), done 3 Oct 2026.
//
// Which private ranges count as "a proxy on this machine". Loopback alone is
// not enough once the API runs in a container: nginx proxies to 127.0.0.1:5000
// on the host, Docker rewrites that to the bridge, and the address this process
// sees on the socket is the bridge gateway - 172.x.0.1 - not 127.0.0.1. Under a
// loopback-only test every request in the world then failed it, fell through to
// the gateway address, and the whole shop shared ONE bucket: six password
// attempts every five minutes for every customer together. Exactly the bug the
// per-caller rewrite was meant to fix, reintroduced by the deployment.
//
// Set Security:TrustProxyFromPrivateNetwork to false to go back to loopback
// only - correct if the API ever runs directly on the host rather than in a
// container. It is safe as it stands because nothing outside this machine can
// reach the port with a private source address: compose publishes it on
// 127.0.0.1, and a packet from the internet carries its own public address.
var trustPrivateHops = builder.Configuration.GetValue("Security:TrustProxyFromPrivateNetwork", true);

bool FromTrustedProxy(HttpContext http)
{
    var peer = http.Connection.RemoteIpAddress;
    if (peer is null) return false;
    if (peer.IsIPv4MappedToIPv6) peer = peer.MapToIPv4();
    if (System.Net.IPAddress.IsLoopback(peer)) return true;
    return trustPrivateHops && IsPrivate(peer);
}

static bool IsPrivate(System.Net.IPAddress ip)
{
    if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
    {
        var b = ip.GetAddressBytes();
        if (b[0] == 10) return true;                                  // 10.0.0.0/8
        if (b[0] == 172 && b[1] >= 16 && b[1] <= 31) return true;     // 172.16.0.0/12 - Docker lives here
        if (b[0] == 192 && b[1] == 168) return true;                  // 192.168.0.0/16
        if (b[0] == 169 && b[1] == 254) return true;                  // link-local
        return false;
    }
    if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
    {
        if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal) return true;
        var b = ip.GetAddressBytes();
        return (b[0] & 0xFE) == 0xFC;                                 // fc00::/7 unique-local
    }
    return false;
}

string CallerIp(HttpContext http)
{
    var direct = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (!FromTrustedProxy(http)) return direct;

    var cf = http.Request.Headers["CF-Connecting-IP"].ToString();
    if (!string.IsNullOrWhiteSpace(cf)) return cf.Trim();

    var real = http.Request.Headers["X-Real-IP"].ToString();
    if (!string.IsNullOrWhiteSpace(real)) return real.Trim();

    // X-Forwarded-For grows left to right, and everything to the left of our own
    // proxy's entry was written by someone we have no reason to believe. The
    // LAST entry is the one our proxy added; the first is the one an attacker
    // would have put there, and the first is what this used to take.
    var fwd = http.Request.Headers["X-Forwarded-For"].ToString();
    if (!string.IsNullOrWhiteSpace(fwd))
    {
        var parts = fwd.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length > 0) return parts[^1];
    }
    return direct;
}

builder.Services.AddRateLimiter(opts =>
{
    // Counted per caller, not for the shop as a whole. It used to be a single
    // shared window: ten sign-in attempts a minute was the budget for EVERY
    // customer together, so one person hammering the login page handed a 429 to
    // every real shopper trying to sign in at the same moment — and a brute
    // force was slowed no more than an honest customer was.
    opts.AddPolicy("auth", http => RateLimitPartition.GetSlidingWindowLimiter(
        CallerIp(http),
        _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 2,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        }));

    // Password guessing deserves a tighter leash than an OTP resend: a wrong
    // password is cheap to try and there is no SMS bill to notice it.
    opts.AddPolicy("login", http => RateLimitPartition.GetSlidingWindowLimiter(
        CallerIp(http),
        _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 6,
            Window = TimeSpan.FromMinutes(5),
            SegmentsPerWindow = 5,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        }));

    // Browser se aane wale analytics event. Inki ginti alag hai kyunki ek aam
    // shopper minute bhar me das panne khol leta hai, aur "auth" wali 10 ki
    // seema me aadhe event chup-chaap gir jate. Yahan jhooth ka koi fayda bhi
    // nahi hai - event bhejne se kisi ko kuch milta nahi - isliye seema sirf
    // badtameezi rokne ke liye hai, pehchan ke liye nahi.
    opts.AddPolicy("events", http => RateLimitPartition.GetSlidingWindowLimiter(
        CallerIp(http),
        _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 90,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 3,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        }));

    opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // A bare 429 with no body reaches the login form as "something went wrong",
    // so the customer tries again immediately, which is the one thing that does
    // not help. Say what happened and how long to wait - in the same
    // { success, message } shape every other endpoint answers in, so the
    // existing error handling on the forms picks it up with no special case.
    opts.OnRejected = async (ctx, ct) =>
    {
        var seconds = ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var after)
            ? (int)Math.Ceiling(after.TotalSeconds)
            : 60;
        if (seconds < 1) seconds = 1;

        var res = ctx.HttpContext.Response;
        res.StatusCode = StatusCodes.Status429TooManyRequests;
        res.Headers.RetryAfter = seconds.ToString();
        await res.WriteAsJsonAsync(new
        {
            success = false,
            message = "Too many attempts from this connection. " + AttemptLimiter.WaitMessage(seconds),
            retryAfterSeconds = seconds,
        }, ct);
    };
});

// ── JWT Auth ──────────────────────────────────────────────────────────────────
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is required in appsettings.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.MapInboundClaims = false;   // CRITICAL: .NET 8 fix for role-based auth
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"],
            ValidAudience            = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        };
    });

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("AdminOnly", policy =>
        policy.RequireClaim("role", "admin"));
    // Owner (admin) OR staff — for daily work: add/edit products, stock, order status.
    opt.AddPolicy("AdminOrStaff", policy =>
        policy.RequireClaim("role", "admin", "staff"));
});

// ── CORS ──────────────────────────────────────────────────────────────────────
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:3000", "https://mahalaxmifashionhub.com"];

// SEC-9: Restrict CORS — specific methods only, no wildcard credentials
builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
              // A browser cannot READ a response header across origins unless it
              // is named here, however plainly the server sent it. These two are
              // the ones a caller is meant to act on: the id to quote when
              // something failed, and how long to wait after a 429.
              .WithExposedHeaders("X-Request-Id", "Retry-After")));

// ── Swagger ───────────────────────────────────────────────────────────────────
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title   = "Mahalaxmi Fashion Hub API",
        Version = "v1",
        Description = "Next.js + .NET + PostgreSQL — Converted from PHP/MySQL"
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In     = ParameterLocation.Header,
        Scheme = "Bearer",
        Type   = SecuritySchemeType.Http,
        Name   = "Authorization",
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
var app = builder.Build();

// Ensure database tables exist on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    // Only one instance may do the schema work at a time.
    //
    // Every boot runs CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF
    // NOT EXISTS over the whole schema. That is idempotent, so running it twice
    // is harmless - running it twice AT ONCE is not. Two versions of the API
    // are deliberately alive together for a few seconds during a zero-downtime
    // switch, both boot, and concurrent CREATE TABLE on the same name races in
    // the catalogue: one of them gets a duplicate-key error on pg_type rather
    // than the "already exists, carry on" it was written to expect, and that
    // instance fails to start. Which is the new one, half the time.
    //
    // A session advisory lock costs nothing and serialises them. The key is
    // arbitrary; it only has to be the same in every copy of this app.
    //
    // OpenConnection pins ONE connection for this whole scope, which is what
    // makes a session lock work at all - without it EF hands back the
    // connection after each statement and the lock goes with it.
    //
    // lock_timeout rather than waiting for ever: if something really is stuck
    // holding this, the boot should fail loudly and let the deploy roll back,
    // not hang while the health check times out with no reason given.
    db.Database.OpenConnection();
    db.Database.ExecuteSqlRaw("SET lock_timeout = '120s'");
    db.Database.ExecuteSqlRaw("SELECT pg_advisory_lock(7273001)");
    try
    {


    // Is the app still a superuser? Said out loud at every boot, because this
    // is the kind of thing that gets fixed once, undone by a restore or a
    // rebuild, and never noticed again. Same reasoning as the endpoint audit:
    // a gap nobody can see is a gap nobody closes.
    try
    {
        var dbLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("DbPrivileges");
        var who = db.Database
            .SqlQueryRaw<string>(@"SELECT current_setting('is_superuser') || ' ' || current_user AS ""Value""")
            .AsEnumerable().FirstOrDefault() ?? "";
        var parts = who.Split(' ', 2);
        var isSuper = parts.Length > 0 && parts[0].Equals("on", StringComparison.OrdinalIgnoreCase);
        var dbUser = parts.Length > 1 && parts[1].Length > 0 ? parts[1] : "?";

        if (isSuper)
        {
            dbLog.LogWarning(
                "Database user {User} is a SUPERUSER. A query that should not have run could "
                + "run a shell command on this server (COPY ... TO PROGRAM) or read every "
                + "password hash. Run database/least-privilege.sql and set APP_DB_USER and "
                + "APP_DB_PASSWORD.", dbUser);
        }
        else
        {
            dbLog.LogInformation("Database user {User} is not a superuser.", dbUser);
        }
    }
    catch (Exception ex)
    {
        app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("DbPrivileges")
            .LogWarning(ex, "Could not check the database user privileges.");
    }

    // Where a sign-in is written down so that it can be cancelled.
    //
    // The access token cannot be: it is a JWT, the server never recorded
    // issuing one, so there is nothing to cross off and it works until it
    // expires. That is why this table exists and why the access token is now
    // minutes rather than weeks. See Services/TokenService.cs.
    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id             SERIAL PRIMARY KEY,
            token_hash     TEXT         NOT NULL,
            subject_type   VARCHAR(20)  NOT NULL,
            subject_id     VARCHAR(64)  NOT NULL,
            email          VARCHAR(255) NOT NULL DEFAULT '',
            role           VARCHAR(50)  NOT NULL DEFAULT '',
            family         VARCHAR(64)  NOT NULL,
            replaced_by    INT,
            device         VARCHAR(200),
            issued_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            expires_at     TIMESTAMPTZ  NOT NULL,
            used_at        TIMESTAMPTZ,
            revoked_at     TIMESTAMPTZ,
            revoked_reason VARCHAR(100)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ux_refresh_token_hash ON refresh_tokens (token_hash);
        CREATE INDEX IF NOT EXISTS idx_refresh_subject ON refresh_tokens (subject_type, subject_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_family  ON refresh_tokens (family);
        CREATE INDEX IF NOT EXISTS idx_refresh_expiry  ON refresh_tokens (expires_at);
    ");
    // Create otp_tokens table if it doesn't exist (no EF migrations used)
    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS otp_tokens (
            id          SERIAL PRIMARY KEY,
            phone       VARCHAR(20),
            email       VARCHAR(255),
            otp_hash    TEXT        NOT NULL,
            purpose     VARCHAR(50) NOT NULL DEFAULT 'login',
            attempts    INT         NOT NULL DEFAULT 0,
            expires_at  TIMESTAMPTZ NOT NULL,
            used        BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        DO $$
        BEGIN
            CREATE UNIQUE INDEX IF NOT EXISTS ux_reviews_order_product
                ON reviews (order_id, product_id) WHERE order_id IS NOT NULL;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'ux_reviews_order_product not created (duplicates exist) - the controller check still applies';
        END $$;
        CREATE TABLE IF NOT EXISTS abandoned_carts (
            id          SERIAL PRIMARY KEY,
            customer_id INT         NOT NULL UNIQUE,
            items_json  JSONB       NOT NULL DEFAULT '[]',
            item_count  INT         NOT NULL DEFAULT 0,
            value       NUMERIC(12,2) NOT NULL DEFAULT 0,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reminded_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS site_event_log (
            id          BIGSERIAL PRIMARY KEY,
            event_name  VARCHAR(40)  NOT NULL,
            value       NUMERIC(12,2),
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_site_event_log_created
            ON site_event_log (created_at DESC);
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
        ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS expected_delivery TIMESTAMPTZ;

        -- Looked up by equality on the tracking page and the order-by-waybill
        -- route, while status, placed_at and payment_id were all indexed and
        -- this was not.
        CREATE INDEX IF NOT EXISTS idx_orders_awb ON site_orders (awb);

        -- The last ten digits of the mobile, kept by the database so a lookup
        -- by number is an equality test rather than LIKE '%number', which no
        -- index can answer. See Models/Customer.cs.
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone10 TEXT
            GENERATED ALWAYS AS (RIGHT(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10)) STORED;
        CREATE INDEX IF NOT EXISTS idx_customers_phone10 ON customers (phone10);
        CREATE TABLE IF NOT EXISTS exchange_requests (
            id               SERIAL PRIMARY KEY,
            order_id         VARCHAR(64)  NOT NULL,
            customer_id      INT,
            have_product_id  INT          NOT NULL,
            have_name        VARCHAR(300) NOT NULL DEFAULT '',
            have_size        VARCHAR(60),
            have_colour      VARCHAR(60),
            have_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
            want_product_id  INT          NOT NULL,
            want_name        VARCHAR(300) NOT NULL DEFAULT '',
            want_size        VARCHAR(60),
            want_colour      VARCHAR(60),
            want_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
            price_difference NUMERIC(12,2) NOT NULL DEFAULT 0,
            reason           VARCHAR(200) NOT NULL DEFAULT '',
            description      TEXT,
            photos           TEXT,
            shipping_paid_by VARCHAR(16)  NOT NULL DEFAULT 'customer',
            status           VARCHAR(24)  NOT NULL DEFAULT 'Requested',
            admin_note       TEXT,
            new_awb          VARCHAR(64),
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_exchange_requests_order  ON exchange_requests (order_id);
        CREATE INDEX IF NOT EXISTS ix_exchange_requests_status ON exchange_requests (status, created_at DESC);
        -- What a product costs us and what we keep. Per piece, and never sent
        -- to the storefront: see the note on Product.StaffPrice.
        ALTER TABLE products ADD COLUMN IF NOT EXISTS staff_price  NUMERIC(12,2);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(12,2);

        -- One row per line of one delivered order: what that sale owes the shop
        -- that supplied it. Written by StaffPayoutSweepService, never by hand.
        --
        -- The unique index is what makes the sweep safe to run as often as it
        -- likes. Without it, two runs overlapping - or one re-run after a crash
        -- halfway through - would write a second row for the same line and the
        -- shop would be owed the money twice. The guard belongs here rather
        -- than in the C#, because a check-then-insert in code has a gap between
        -- the two halves and this does not.
        CREATE TABLE IF NOT EXISTS staff_payouts (
            id              SERIAL PRIMARY KEY,
            order_id        VARCHAR(64)  NOT NULL,
            line_index      INT          NOT NULL,
            shop_name       VARCHAR(160) NOT NULL,
            product_id      INT,
            sku             VARCHAR(64),
            product_name    VARCHAR(300) NOT NULL DEFAULT '',
            qty             INT          NOT NULL DEFAULT 1,
            sold_unit       NUMERIC(12,2) NOT NULL DEFAULT 0,
            staff_unit      NUMERIC(12,2) NOT NULL DEFAULT 0,
            staff_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
            platform_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            delivered_at    TIMESTAMPTZ  NOT NULL,
            payable_at      TIMESTAMPTZ  NOT NULL,
            status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
            paid_at         TIMESTAMPTZ,
            paid_note       VARCHAR(300),
            cancel_reason   VARCHAR(300),
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_payouts_line
            ON staff_payouts (order_id, line_index);
        CREATE INDEX IF NOT EXISTS ix_staff_payouts_shop
            ON staff_payouts (shop_name, status);
        CREATE INDEX IF NOT EXISTS ix_staff_payouts_payable
            ON staff_payouts (status, payable_at);

        CREATE TABLE IF NOT EXISTS invite_sends (
            id         SERIAL PRIMARY KEY,
            audience   VARCHAR(16)  NOT NULL,
            person_id  INT          NOT NULL,
            channel    VARCHAR(16)  NOT NULL,
            email      VARCHAR(255),
            phone      VARCHAR(20),
            sent_by    VARCHAR(160),
            sent_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        ALTER TABLE invite_sends ADD COLUMN IF NOT EXISTS email VARCHAR(255);
        ALTER TABLE invite_sends ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
        CREATE INDEX IF NOT EXISTS ix_invite_sends_person
            ON invite_sends (audience, person_id);
        CREATE INDEX IF NOT EXISTS ix_invite_sends_email ON invite_sends (email);
        CREATE INDEX IF NOT EXISTS ix_invite_sends_phone ON invite_sends (phone);
        -- Three tidy-ups over tables that already exist, wrapped together so a
        -- fresh database - where they do not yet - cannot stop the app starting.
        -- Each is written to settle down to doing nothing once it has run.
        DO $$
        BEGIN
            -- Mobile numbers, all in one shape: the last ten digits. They were
            -- stored however they were typed, so +919352460180 and 9352460180
            -- sat in the table as two different customers.
            UPDATE customers
               SET phone = right(regexp_replace(phone, '\D', '', 'g'), 10)
             WHERE phone IS NOT NULL
               AND length(regexp_replace(phone, '\D', '', 'g')) >= 10
               AND phone <> right(regexp_replace(phone, '\D', '', 'g'), 10);

            -- Invite rows written before the contact was stored on them.
            UPDATE invite_sends s
               SET email = NULLIF(lower(trim(c.email)), ''),
                   phone = NULLIF(right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10), '')
              FROM customers c
             WHERE s.audience = 'customer' AND s.person_id = c.id
               AND s.email IS NULL AND s.phone IS NULL;
            UPDATE invite_sends s
               SET email = NULLIF(lower(trim(l.email)), ''),
                   phone = NULLIF(right(regexp_replace(coalesce(l.phone,''), '\D', '', 'g'), 10), '')
              FROM popup_leads l
             WHERE s.audience = 'lead' AND s.person_id = l.id
               AND s.email IS NULL AND s.phone IS NULL;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'invite/phone tidy-up skipped: %', SQLERRM;
        END $$;
        -- products.newest, made to mean what it says.
        --
        -- It is the shop front's sort order, DESCENDING, and it was only ever
        -- filled with a product's position inside the batch it was loaded in.
        -- So a product added on its own got 1 - the BACK of the queue, under
        -- everything from the first import - and disappeared to the last page
        -- of the listing on the day it was created.
        --
        -- Nothing in the admin panel sets this column by hand, so there is no
        -- arrangement here to preserve: lining it up with the id is the order
        -- it was always trying to express, and the order the homepage already
        -- sorts by. The WHERE makes it settle down to touching nothing once
        -- it has run, and a new product taking max+1 keeps it that way.
        DO $$
        BEGIN
            UPDATE products p
               SET newest = r.rn
              FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM products) r
             WHERE p.id = r.id AND p.newest IS DISTINCT FROM r.rn;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'product newest realign skipped: %', SQLERRM;
        END $$;
        CREATE TABLE IF NOT EXISTS popup_leads (
            id         SERIAL PRIMARY KEY,
            name       VARCHAR(255),
            email      VARCHAR(255),
            phone      VARCHAR(20),
            source     VARCHAR(50) NOT NULL DEFAULT 'welcome_popup',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE popup_leads ADD COLUMN IF NOT EXISTS name VARCHAR(255);
        -- One person, one row. Two people may share a name - two Dineshes are
        -- two customers - but a number or an address belongs to one person, and
        -- a list holding the same person twice messages them twice, which is
        -- how a shop earns a block on WhatsApp.
        --
        -- The de-duplicating was already being attempted in code and did not
        -- work on the commonest Indian case: it kept every digit, so
        -- +91 87490 39868 was stored as 918749039868 and never matched the
        -- 8749039868 the same person typed the next time. Last ten digits is
        -- what identifies the phone; 91, +91 and a leading 0 are how it was
        -- dialled. The rest of this codebase has always known that - see
        -- CustomerKeys.Phone - and this one corner did not.
        --
        -- Blank is not a value: an empty string would collide with every other
        -- empty string under the unique index below.
        UPDATE popup_leads SET email = NULL WHERE email IS NOT NULL AND btrim(email) = '';
        UPDATE popup_leads SET phone = NULL WHERE phone IS NOT NULL AND btrim(phone) = '';
        UPDATE popup_leads SET email = lower(btrim(email))
         WHERE email IS NOT NULL AND email <> lower(btrim(email));
        UPDATE popup_leads
           SET phone = right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
         WHERE phone IS NOT NULL
           AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10
           AND phone <> right(regexp_replace(phone, '[^0-9]', '', 'g'), 10);

        -- What must be unique is the PAIR, not each column on its own.
        --
        -- One man reaches the shop on two numbers from one address, and from
        -- one number under two addresses. Those are three ways to reach him
        -- and all three are worth keeping; a rule that made the email unique
        -- would have thrown the second away, and one that made the phone
        -- unique would have thrown the third away. Only the same number AND
        -- the same address together is the same contact twice.
        --
        -- coalesce rather than a plain two-column index, because in SQL two
        -- NULLs are not equal: without it, a row with a phone and no address
        -- could be inserted again and again. NULLS NOT DISTINCT would say it
        -- too and needs PostgreSQL 15; this says it on any version.
        DROP INDEX IF EXISTS ux_popup_leads_email;   -- rolling-deploy: safe, never served a query
        DROP INDEX IF EXISTS ux_popup_leads_phone;   -- rolling-deploy: safe, never served a query
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM popup_leads
                            GROUP BY coalesce(email, ''), coalesce(phone, '')
                           HAVING count(*) > 1) THEN
                CREATE UNIQUE INDEX IF NOT EXISTS ux_popup_leads_person
                    ON popup_leads (coalesce(email, ''), coalesce(phone, ''));
            ELSE
                RAISE NOTICE 'popup_leads: the same number and address on more than one row, unique index not created yet';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'popup_leads unique index skipped: %', SQLERRM;
        END $$;
        CREATE TABLE IF NOT EXISTS feedback (
            id          SERIAL PRIMARY KEY,
            name        VARCHAR(120),
            email       VARCHAR(160),
            phone       VARCHAR(20),
            topic       VARCHAR(30)  NOT NULL DEFAULT 'other',
            rating      INT          NOT NULL DEFAULT 0,
            message     TEXT         NOT NULL,
            page_url    VARCHAR(500),
            customer_id INT,
            is_handled  BOOLEAN      NOT NULL DEFAULT FALSE,
            admin_note  TEXT,
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_feedback_created ON feedback (created_at DESC);
        CREATE TABLE IF NOT EXISTS coupons (
            id          SERIAL PRIMARY KEY,
            code        VARCHAR(50)   NOT NULL,
            type        VARCHAR(20)   NOT NULL DEFAULT 'flat',
            value       NUMERIC(12,2) NOT NULL DEFAULT 0,
            min_order   NUMERIC(12,2) NOT NULL DEFAULT 0,
            max_uses    INT,
            used_count  INT           NOT NULL DEFAULT 0,
            expires_at  TIMESTAMPTZ,
            is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS staff_members (
            id            SERIAL PRIMARY KEY,
            name          VARCHAR(255) NOT NULL,
            username      VARCHAR(255) NOT NULL,
            email         VARCHAR(255),
            password_hash TEXT         NOT NULL,
            role          VARCHAR(50)  NOT NULL DEFAULT 'staff',
            is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
            last_login    TIMESTAMPTZ,
            created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS influencers (
            id              SERIAL PRIMARY KEY,
            name            VARCHAR(255) NOT NULL,
            email           VARCHAR(255) NOT NULL,
            phone           VARCHAR(20),
            social_handle   VARCHAR(255),
            platform        VARCHAR(50)  NOT NULL DEFAULT 'Instagram',
            followers_count VARCHAR(50),
            category        VARCHAR(100),
            niche           TEXT,
            status          VARCHAR(50)  NOT NULL DEFAULT 'pending',
            coupon_code     VARCHAR(50),
            commission_rate NUMERIC(5,2) NOT NULL DEFAULT 3,
            admin_notes     TEXT,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        ALTER TABLE influencers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
        ALTER TABLE influencers ADD COLUMN IF NOT EXISTS reset_requested_at TIMESTAMPTZ;
        -- Birthday/anniversary offer tracking: coupons carry an occasion; customers get a
        -- per-occasion 'used' flag so their special date locks only after the offer is redeemed.
        ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS occasion VARCHAR(20) NOT NULL DEFAULT 'none';
        ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS customer_id INT;
        ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS once_per_customer BOOLEAN NOT NULL DEFAULT FALSE;

        -- Who has already used which code.
        --
        -- A coupon only ever had ONE counter: max_uses across everybody. So a
        -- welcome code was a race - the first hundred shoppers took it and the
        -- hundred-and-first was told the offer had reached its limit, while
        -- nothing at all stopped the same person redeeming it over and over.
        -- Both halves were wrong, and they were wrong in opposite directions.
        --
        -- One row per identity per code. The UNIQUE index is what enforces the
        -- rule: not a SELECT that another order can slip past between the read
        -- and the write, but the database refusing the second row outright.
        CREATE TABLE IF NOT EXISTS coupon_redemptions (
            id         SERIAL PRIMARY KEY,
            code_lower VARCHAR(50)  NOT NULL,
            id_kind    VARCHAR(10)  NOT NULL,    -- 'phone' | 'email'
            id_value   VARCHAR(255) NOT NULL,    -- normalised: last 10 digits, or lower-cased email
            order_id   VARCHAR(64),
            created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ux_coupon_redemption
            ON coupon_redemptions (code_lower, id_kind, id_value);
        CREATE INDEX IF NOT EXISTS ix_coupon_redemption_order
            ON coupon_redemptions (order_id);

        -- How many times one shopper may use a code, rather than only a tick.
        --
        -- once_per_customer arrived later, with DEFAULT FALSE. So every coupon
        -- that already existed when it was added - WELCOME10 among them - came
        -- out unlimited per person, and nothing on the screen said so. The same
        -- shopper could take the welcome discount on every order she placed.
        --
        -- NULL means nobody has set it, 0 means no limit, N means N times each.
        -- The back-fill below turns every NULL into 1. It is safe to run on
        -- every start because the admin screen always writes a number, 0 for no
        -- limit, so a coupon deliberately left unlimited never reads NULL again
        -- and is never quietly set back to 1.
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_per_customer INT;
        UPDATE coupons SET max_per_customer = 1 WHERE max_per_customer IS NULL;

        -- One row per identity per code, now carrying a COUNT instead of
        -- meaning once.
        --
        -- The unique index above stays exactly as it is, on purpose: it is what
        -- makes the claim atomic. INSERT ... ON CONFLICT DO UPDATE ... WHERE
        -- uses < limit is a single statement, so two orders in the same second
        -- cannot both be told there is room. Dropping that index to allow N
        -- rows per person would have handed the race back.
        ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS uses INT NOT NULL DEFAULT 1;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday_offer_used    BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS anniversary_offer_used BOOLEAN NOT NULL DEFAULT FALSE;
        -- Customer-uploaded profile photo URL (served by the customers photo endpoint).
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS photo_url TEXT;
        -- Per-staff admin-section permissions (comma-separated section keys).
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS permissions TEXT;
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS shop_name   TEXT;
        ALTER TABLE products      ADD COLUMN IF NOT EXISTS shop_name   TEXT;
        -- Manual per-product shipping charge, folded into the final customer price (hidden as a line).
        ALTER TABLE products  ADD COLUMN IF NOT EXISTS shipping_charge NUMERIC NOT NULL DEFAULT 0;
        -- Customer-uploaded review photos (JSON array of image URLs).
        ALTER TABLE reviews   ADD COLUMN IF NOT EXISTS image_urls TEXT;

        -- What a customer thinks of the shop, said from inside the app.
        -- Kept apart from reviews on purpose: that table is guarded by a
        -- delivered order and the product having been on it, which is what
        -- makes its verified-purchase badge mean anything. A rating of the
        -- shop has neither, and bending the one to hold the other would
        -- weaken every product review on the site.
        CREATE TABLE IF NOT EXISTS app_reviews (
            id              SERIAL PRIMARY KEY,
            customer_id     INTEGER,
            name            VARCHAR(120),
            rating          SMALLINT NOT NULL,
            body            TEXT,
            status          VARCHAR(20) NOT NULL DEFAULT 'pending',
            source          VARCHAR(20) NOT NULL DEFAULT 'app',
            play_invited_at TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ
        );
        -- The admin queue reads pending, newest first; the website reads
        -- approved, newest first. One index answers both.
        CREATE INDEX IF NOT EXISTS ix_app_reviews_status_created
            ON app_reviews (status, created_at DESC);
        -- A signed-in customer has one rating of the shop. Rating again is
        -- changing their mind, and the controller rewrites the row; this
        -- stops two rows existing if two taps ever race each other.
        CREATE UNIQUE INDEX IF NOT EXISTS ux_app_reviews_customer
            ON app_reviews (customer_id) WHERE customer_id IS NOT NULL;
        CREATE TABLE IF NOT EXISTS supplier_applications (
            id                SERIAL PRIMARY KEY,
            firm_name         VARCHAR(255) NOT NULL,
            contact_name      VARCHAR(255) NOT NULL,
            phone             VARCHAR(20)  NOT NULL,
            email             VARCHAR(255),
            gst_number        VARCHAR(20),
            pan_number        VARCHAR(20),
            business_type     VARCHAR(50),
            categories        TEXT,
            address           TEXT,
            city              VARCHAR(120),
            state             VARCHAR(120),
            pincode           VARCHAR(10),
            website           VARCHAR(255),
            years_in_business VARCHAR(50),
            message           TEXT,
            status            VARCHAR(30)  NOT NULL DEFAULT 'new',
            created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        UPDATE site_orders SET status = 'Pending'
            WHERE status IN ('Order Received', 'Pending confirmation', 'Paid', 'Order Packed');
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id         SERIAL PRIMARY KEY,
            endpoint   TEXT NOT NULL UNIQUE,
            p256dh     TEXT NOT NULL DEFAULT '',
            auth       TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS meta_leads (
            id            SERIAL PRIMARY KEY,
            leadgen_id    VARCHAR(64) NOT NULL UNIQUE,
            form_id       VARCHAR(64),
            form_name     VARCHAR(255),
            page_id       VARCHAR(64),
            ad_id         VARCHAR(64),
            campaign_name VARCHAR(255),
            full_name     VARCHAR(255),
            phone         VARCHAR(32),
            email         VARCHAR(255),
            city          VARCHAR(128),
            state         VARCHAR(128),
            raw_json      TEXT,
            is_read       BOOLEAN NOT NULL DEFAULT FALSE,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_meta_leads_created ON meta_leads (created_at DESC);

        -- Leads from Google Ads lead forms. Google has no webhook for us and
        -- drops the data after about 60 days, so a sync copies each one here
        -- and it stays. submission_id is Google's, and is what stops a repeat
        -- sync from adding the same person twice.
        CREATE TABLE IF NOT EXISTS google_leads (
            id            SERIAL PRIMARY KEY,
            submission_id VARCHAR(64) NOT NULL UNIQUE,
            campaign_name VARCHAR(255),
            asset_name    VARCHAR(255),
            full_name     VARCHAR(255),
            phone         VARCHAR(32),
            email         VARCHAR(255),
            city          VARCHAR(128),
            postal_code   VARCHAR(16),
            raw_json      TEXT,
            is_read       BOOLEAN NOT NULL DEFAULT FALSE,
            submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_google_leads_submitted ON google_leads (submitted_at DESC);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS wallet_transactions (
            id            SERIAL PRIMARY KEY,
            customer_id   INTEGER NOT NULL,
            amount        NUMERIC(12,2) NOT NULL,
            type          VARCHAR(24) NOT NULL,
            order_id      VARCHAR(64),
            note          TEXT,
            balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_wallet_tx_customer ON wallet_transactions (customer_id, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_earn_order ON wallet_transactions (order_id) WHERE type = 'earn';
        ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS wallet_used NUMERIC(12,2) NOT NULL DEFAULT 0;
        ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS review_asked_at TIMESTAMPTZ;
        -- How many times this order has been asked for a review. The column
        -- review_asked_at used to mean: already asked, never again. It now means:
        -- last asked at. This one counts the asks. Orders stamped under the old
        -- rule have had exactly one, so they are backfilled to 1 rather than
        -- starting over and asking an old customer three more times.
        ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS review_asks_sent INT NOT NULL DEFAULT 0;
        UPDATE site_orders SET review_asks_sent = 1
         WHERE review_asked_at IS NOT NULL AND review_asks_sent = 0;
        ALTER TABLE cashfree_orders ADD COLUMN IF NOT EXISTS wallet_used NUMERIC(12,2) NOT NULL DEFAULT 0;
        ALTER TABLE cashfree_orders ADD COLUMN IF NOT EXISTS full_total NUMERIC(12,2) NOT NULL DEFAULT 0;
        ALTER TABLE cashfree_orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS referrer_customer_id INTEGER;

        -- Address book: a customer can save several delivery addresses (Home, Office, ...)
        -- and mark one default. The single address on `customers` is left untouched.
        CREATE TABLE IF NOT EXISTS customer_addresses (
            id          SERIAL PRIMARY KEY,
            customer_id INTEGER NOT NULL,
            label       VARCHAR(30)  NOT NULL DEFAULT 'Home',
            full_name   VARCHAR(120) NOT NULL DEFAULT '',
            phone       VARCHAR(20)  NOT NULL DEFAULT '',
            addr_line1  TEXT         NOT NULL DEFAULT '',
            addr_line2  TEXT         NOT NULL DEFAULT '',
            pincode     VARCHAR(10)  NOT NULL DEFAULT '',
            city        VARCHAR(80)  NOT NULL DEFAULT '',
            state       VARCHAR(80)  NOT NULL DEFAULT '',
            is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_cust_addr_customer ON customer_addresses (customer_id, is_default DESC, id);

        -- Janmdin/saalgirah ki offer kab-kab bheji gayi. Pehle ye hisab browser
        -- ke localStorage me tha, isliye logout karte hi Resend gayab ho jata
        -- tha aur wahi offer dobara bhej di jati thi. Ab ek jagah, sab device ke
        -- liye ek hi sach. year grahak ke DIN ka saal hai, bhejne ka nahi.
        CREATE TABLE IF NOT EXISTS celebration_sends (
            id          SERIAL PRIMARY KEY,
            customer_id INTEGER     NOT NULL,
            occasion    VARCHAR(20) NOT NULL DEFAULT 'birthday',
            slab        INTEGER     NOT NULL DEFAULT 0,
            year        INTEGER     NOT NULL,
            coupon_code VARCHAR(50),
            sms_sent    BOOLEAN     NOT NULL DEFAULT FALSE,
            email_sent  BOOLEAN     NOT NULL DEFAULT FALSE,
            request_id  VARCHAR(64),
            sent_by     VARCHAR(120),
            sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_celeb_send_lookup
            ON celebration_sends (customer_id, occasion, year, slab);

        -- Cash on Delivery advance: how much the customer already paid online. The courier
        -- must then collect only (total - wallet_used - advance_paid).
        ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS advance_paid NUMERIC(12,2) NOT NULL DEFAULT 0;

        -- Bill ki apni tareekh: number jis ghadi diya gaya, wahi.
        -- Pehle number 'Ready for Shipping' par milta tha aur tareekh order
        -- wali chapti thi -- do alag ghadiyan. Ek purana order baad me pack
        -- karo to bada number choti tareekh le aata tha (011 par 18/10 aur
        -- 012 par 17/10), jo GST ki series todta hai.
        ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;
        ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS bag_barcode VARCHAR(64);
        CREATE UNIQUE INDEX IF NOT EXISTS ux_site_orders_bag_barcode
            ON site_orders (bag_barcode) WHERE bag_barcode IS NOT NULL;
        -- Jo bill pehle hi chhap chuke hain unki tareekh nahi badalti: purane
        -- parcels par order wali tareekh chhapi ja chuki hai, aur kitaab ko
        -- chhape hue kagaz se alag kar dena isse badi galti hai.
        UPDATE site_orders SET invoiced_at = placed_at
         WHERE invoice_number IS NOT NULL AND invoiced_at IS NULL;

        -- Paisa jo grahak ko wapas dena hai. Wallet ka hissa to Return/Cancel
        -- hote hi apne aap laut jata hai; ye row us DUSRE paise ki hai jo
        -- grahak ne online diya tha -- prepaid total, ya COD ka advance.
        -- Wo paisa dukaan se bahar jata hai, isliye chupchap nahi jata:
        -- pehle pending row banti hai, phir malik rakam aur zariya tay karta
        -- hai, tab payout hota hai.
        CREATE TABLE IF NOT EXISTS order_refunds (
            id                SERIAL PRIMARY KEY,
            order_id          VARCHAR(64)   NOT NULL,
            suggested_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
            amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
            method            VARCHAR(16)   NOT NULL DEFAULT '',
            gateway           VARCHAR(16),
            gateway_refund_id VARCHAR(80),
            status            VARCHAR(16)   NOT NULL DEFAULT 'pending',
            note              TEXT,
            failure_reason    TEXT,
            created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
            settled_at        TIMESTAMPTZ,
            settled_by        VARCHAR(120)
        );
        CREATE INDEX IF NOT EXISTS idx_order_refunds_status
            ON order_refunds (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_order_refunds_order
            ON order_refunds (order_id, id DESC);
        -- Ek order par ek hi khuli (pending) refund row. Do baar status
        -- Return par set karne se, ya do admin ek saath kaam karein to,
        -- warna do refund ban jate the aur paisa do baar ja sakta tha.
        CREATE UNIQUE INDEX IF NOT EXISTS uq_order_refund_open
            ON order_refunds (order_id) WHERE status = 'pending';
    ");

    // Web Push VAPID keys.
    //
    // The private key used to be written here, in the file, in a repository
    // anyone can read. A VAPID private key is what proves a notification came
    // from this shop; whoever holds it can send push notifications that arrive
    // on our customers' phones wearing our name. It was committed, so it is
    // burnt — see RUNBOOK-PENDING.md ("Rotate the push keys"): generate a new
    // pair, put it in appsettings.json on the server, and update the row.
    //
    // Nothing is seeded now unless the server supplies it. Push notifications
    // simply stay off until someone configures them, which is the right way for
    // a secret to be missing: visibly, not silently.
    var vapidPublic  = app.Configuration["Push:VapidPublicKey"];
    var vapidPrivate = app.Configuration["Push:VapidPrivateKey"];
    if (!string.IsNullOrWhiteSpace(vapidPublic) && !db.SiteSettings.Any(x => x.Key == "vapidPublicKey"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "vapidPublicKey", Value = vapidPublic });
    if (!string.IsNullOrWhiteSpace(vapidPrivate) && !db.SiteSettings.Any(x => x.Key == "vapidPrivateKey"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "vapidPrivateKey", Value = vapidPrivate });
    // Cash on Delivery money rules — editable from admin Settings.
    if (!db.SiteSettings.Any(x => x.Key == "codAdvanceAmount"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "codAdvanceAmount", Value = "0" });
    if (!db.SiteSettings.Any(x => x.Key == "codFeeAmount"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "codFeeAmount", Value = "50" });
    if (!db.SiteSettings.Any(x => x.Key == "vapidSubject"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "vapidSubject", Value = "mailto:mahalaxmifashionhub@gmail.com" });

    // Loyalty wallet defaults (admin-editable in Settings → "Loyalty Wallet & Points").
    if (!db.SiteSettings.Any(x => x.Key == "loyaltyEnabled"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "loyaltyEnabled", Value = "true" });
    if (!db.SiteSettings.Any(x => x.Key == "loyaltyEarnPercent"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "loyaltyEarnPercent", Value = "5" });   // ₹ credited per ₹100 spent (5 = 5%)
    if (!db.SiteSettings.Any(x => x.Key == "loyaltyRedeemMaxPercent"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "loyaltyRedeemMaxPercent", Value = "20" }); // max % of an order payable from wallet

    // Refer & Earn defaults (admin-editable in Settings → "Refer & Earn").
    if (!db.SiteSettings.Any(x => x.Key == "referralEnabled"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "referralEnabled", Value = "true" });
    if (!db.SiteSettings.Any(x => x.Key == "referralNewUserDiscount"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "referralNewUserDiscount", Value = "100" }); // ₹ off for the friend's first order
    if (!db.SiteSettings.Any(x => x.Key == "referralMinOrder"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "referralMinOrder", Value = "499" });   // min order for the discount
    if (!db.SiteSettings.Any(x => x.Key == "referralReferrerReward"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "referralReferrerReward", Value = "100" }); // ₹ wallet to the referrer on delivery
    // Paid the moment a friend's account is created with the code, so the money
    // is in the wallet while the referrer is still thinking about the shop.
    if (!db.SiteSettings.Any(x => x.Key == "referralRewardOnSignup"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "referralRewardOnSignup", Value = "true" });
    if (!db.SiteSettings.Any(x => x.Key == "referralSignupReward"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "referralSignupReward", Value = "100" });
    // A reward with no ceiling is a price list for making accounts. Per referrer,
    // over a rolling 30 days.
    if (!db.SiteSettings.Any(x => x.Key == "referralSignupRewardMonthlyCap"))
        db.SiteSettings.Add(new MahalaxmiApi.Models.SiteSetting { Key = "referralSignupRewardMonthlyCap", Value = "20" });
    db.SaveChanges();

    // Photos that were stored as base64 because a file write once failed.
    //
    // SaveBase64Image used to fall back to keeping the data: URL in the row.
    // One such row is enough to break the admin Products screen: the list
    // endpoint carries every image inline, so a few hundred KB of base64 per
    // product grows the response until it dies with ERR_HTTP2_PROTOCOL_ERROR,
    // and next/image answers 504 for a url= that is itself a data: URL.
    //
    // The fallback is gone, so no new row can be written this way. This clears
    // up the ones already there. Safe to run on every start: with nothing to
    // repair it is one indexed-free scan of a small table and no writes, and
    // a photo it cannot convert is left exactly as it is for a human to look
    // at rather than being blanked.
    try
    {
        var poisoned = db.Products
            .Where(p => p.Image != null && p.Image.StartsWith("data:"))
            .ToList();

        if (poisoned.Count > 0)
        {
            var fixedCount = 0;
            foreach (var prod in poisoned)
            {
                try
                {
                    var path = MahalaxmiApi.Controllers.ProductsController
                        .SaveBase64Image(prod.Image, $"repair-{prod.Id}");
                    if (!string.IsNullOrWhiteSpace(path) && path!.StartsWith("/product-images/"))
                    {
                        prod.Image = path;
                        fixedCount++;
                    }
                }
                catch (Exception ex)
                {
                    app.Logger.LogError(ex,
                        "Could not rescue the stored photo for product {Id} ({Sku}); leaving it as it is.",
                        prod.Id, prod.Sku);
                }
            }
            if (fixedCount > 0) db.SaveChanges();
            app.Logger.LogWarning(
                "Product photos stored as base64: {Found} found, {Fixed} written out to files.",
                poisoned.Count, fixedCount);
        }
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "The base64 product-photo repair could not run.");
    }
    }
    finally
    {
        // Released explicitly, though closing the connection would do it too -
        // the next thing this scope does is dispose, and a lock that depends on
        // a dispose happening is a lock somebody will eventually move.
        try { db.Database.ExecuteSqlRaw("SELECT pg_advisory_unlock(7273001)"); }
        catch { /* the connection is going anyway, which releases it */ }
        db.Database.CloseConnection();
    }

}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// ── One entry point ──────────────────────────────────────────────────────────
//
// Outermost, and in this order, because each wraps the next.
//
// UseRequestContext gives the request an id and puts it on every log line it
// produces; UseFaultHandler needs that id to exist, so it goes inside.
//
// Both go above the limiter and authentication, so that a 429 and a 401 carry
// the request id too - those are the two answers a customer is most likely to
// ring up about, and before this neither could be matched to a log line.
app.UseRequestContext();
app.UseFaultHandler();

app.UseHttpsRedirection();

// ── Security Headers ──────────────────────────────────────────────────────────
// SEC-10: Harden HTTP response headers
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Frame-Options"]           = "DENY";
    headers["X-Content-Type-Options"]    = "nosniff";
    headers["X-XSS-Protection"]          = "1; mode=block";
    headers["Referrer-Policy"]           = "strict-origin-when-cross-origin";
    headers["Permissions-Policy"]        = "geolocation=(), microphone=(), camera=()";
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    headers["Content-Security-Policy"]   =
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://www.googletagmanager.com https://www.google-analytics.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' https://api.razorpay.com https://www.google-analytics.com; " +
        "font-src 'self'; " +
        "frame-src https://api.razorpay.com;";
    await next();
});

app.UseCors();
app.UseRateLimiter(); // SEC-8: Apply [EnableRateLimiting("auth")] to auth/OTP controller actions
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// GET /api/health/caller
//
// What every rate limit in the shop is counted under, for this request.
//
// It exists because the answer depends on the deployment, not on the code, and
// getting it wrong is silent: if the hop is not recognised, every caller in the
// world shares one bucket and the limits are either useless or lock everyone
// out, and nothing in the logs says so. One request from a phone answers it:
// `caller` should be that phone's own address, and `trustedHop` true.
//
// Open on purpose, so it can be checked from a phone browser without a token.
// It tells a caller its own address and whether this server believes the
// headers nginx sets - nothing it could not already work out by trying.
app.MapGet("/api/health/caller", (HttpContext http) => Results.Ok(new
{
    peer      = http.Connection.RemoteIpAddress?.ToString(),
    trustedHop = FromTrustedProxy(http),
    caller    = CallerIp(http),
    headers   = new
    {
        cfConnectingIp = http.Request.Headers["CF-Connecting-IP"].ToString(),
        xRealIp        = http.Request.Headers["X-Real-IP"].ToString(),
        xForwardedFor  = http.Request.Headers["X-Forwarded-For"].ToString(),
    },
}));

// GET /api/health/endpoints  (owner only)
//
// The same table, on demand, so it can be read without going to the VPS for
// the startup log. Owner only and 404 otherwise: a list of every route with
// what guards each one is a useful thing for us and a useful thing for
// somebody else, so it is not advertised to a caller who may not have it.
app.MapGet("/api/health/endpoints", (HttpContext http, EndpointDataSource source) =>
{
    if (!http.User.IsOwner()) return Results.NotFound();
    var rows = EndpointAudit.Inspect(source);
    return Results.Ok(new
    {
        total = rows.Count,
        noRateLimit = rows.Count(r => r.Limit == "none"),
        publicWrites = rows.Count(r => r.Guard == "PUBLIC" && r.Writes),
        needsAttention = rows.Where(r => r.Risky).Select(r => new { r.Methods, r.Route }),
        routes = rows.Select(r => new { r.Methods, r.Route, r.Guard, r.Limit }),
    });
}).RequireAuthorization();

// ── What is guarded, and what is not ────────────────────────────────────────
//
// Printed at startup, once the routes are built. See Services/EndpointAudit.cs
// for why: the controls themselves are fine, it is REMEMBERING to attach them
// to each new endpoint that fails, and six endpoints had been missed. A gap
// should be something the server says out loud, not something somebody has to
// go looking for.
{
    var log = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("EndpointAudit");
    try
    {
        var endpoints = app.Services.GetRequiredService<EndpointDataSource>();
        EndpointAudit.Report(EndpointAudit.Inspect(endpoints), log);
    }
    catch (Exception ex)
    {
        // A report about the app must never be what stops the app.
        log.LogWarning(ex, "Endpoint audit could not run.");
    }
}

app.Run();
