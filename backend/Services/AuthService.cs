using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace MahalaxmiApi.Services;

public class AuthService
{
    private readonly IConfiguration _config;

    public AuthService(IConfiguration config) => _config = config;

    public (string hash, string salt) HashPassword(string password)
    {
        // Use BCrypt for customer passwords
        var hash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12);
        return (hash, ""); // BCrypt embeds salt
    }

    public bool VerifyPassword(string password, string hash, string salt)
    {
        if (string.IsNullOrEmpty(hash)) return false;
        // BCrypt hash starts with $2
        if (hash.StartsWith("$2"))
            return BCrypt.Net.BCrypt.Verify(password, hash);

        // Legacy PBKDF2 fallback (if old passwords exist)
        var derivedKey = PBKDF2Hash(password, salt);
        return derivedKey == hash;
    }

    private static string PBKDF2Hash(string password, string salt)
    {
        var saltBytes = Convert.FromBase64String(salt);
        using var rfc = new Rfc2898DeriveBytes(password, saltBytes, 10000, HashAlgorithmName.SHA256);
        return Convert.ToBase64String(rfc.GetBytes(32));
    }

    public string GenerateJwt(string userId, string email, string role)
    {
        var key    = _config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key missing");
        var issuer = _config["Jwt:Issuer"] ?? "MahalaxmiApi";
        var audience = _config["Jwt:Audience"] ?? "MahalaxmiFashionHub";

        var secKey  = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var creds   = new SigningCredentials(secKey, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub,   userId),
            new Claim(JwtRegisteredClaimNames.Email, email),
            new Claim("role", role),
            new Claim(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            issuer:   issuer,
            audience: audience,
            claims:   claims,
            expires:  DateTime.UtcNow.AddDays(role == "admin" ? 7 : 30),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
