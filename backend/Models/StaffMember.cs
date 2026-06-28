using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace MahalaxmiApi.Models;
[Table("staff_members")]
public class StaffMember {
    [Key][Column("id")] public int Id { get; set; }
    [Required][Column("name")] public string Name { get; set; } = string.Empty;
    [Required][Column("username")] public string Username { get; set; } = string.Empty;
    [Column("email")] public string? Email { get; set; }
    [Required][Column("password_hash")] public string PasswordHash { get; set; } = string.Empty;
    [Column("role")] public string Role { get; set; } = "staff";
    [Column("is_active")] public bool IsActive { get; set; } = true;
    [Column("last_login")] public DateTimeOffset? LastLogin { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
