using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using MahalaxmiApi.Data;
using MahalaxmiApi.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──────────────────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// ── Services ──────────────────────────────────────────────────────────────────
builder.Services.AddScoped<AuthService>();
builder.Services.AddHttpClient("razorpay");
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddMemoryCache(); // PERF-2: for settings caching

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// SEC-8: Protect auth & OTP endpoints from brute-force (10 req/min)
builder.Services.AddRateLimiter(opts =>
{
    opts.AddSlidingWindowLimiter("auth", o =>
    {
        o.PermitLimit = 10;
        o.Window = TimeSpan.FromMinutes(1);
        o.SegmentsPerWindow = 2;
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit = 0;
    });
    opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
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
});

// ── CORS ──────────────────────────────────────────────────────────────────────
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:3000", "https://mahalaxmifashionhub.com"];

// SEC-9: Restrict CORS — specific methods only, no wildcard credentials
builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")));

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
        CREATE TABLE IF NOT EXISTS popup_leads (
            id         SERIAL PRIMARY KEY,
            name       VARCHAR(255),
            email      VARCHAR(255),
            phone      VARCHAR(20),
            source     VARCHAR(50) NOT NULL DEFAULT 'welcome_popup',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE popup_leads ADD COLUMN IF NOT EXISTS name VARCHAR(255);
    ");
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

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

app.Run();
