using Microsoft.EntityFrameworkCore;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Product>     Products     { get; set; }
    public DbSet<Customer>    Customers    { get; set; }
    public DbSet<SiteOrder>   SiteOrders   { get; set; }
    public DbSet<RazorpayOrder> RazorpayOrders { get; set; }
    public DbSet<CashfreeOrder> CashfreeOrders { get; set; }
    public DbSet<AdminToken>  AdminTokens  { get; set; }
    public DbSet<OtpToken>    OtpTokens    { get; set; }
    public DbSet<SiteSetting> SiteSettings { get; set; }
    public DbSet<Review>      Reviews      { get; set; }
    public DbSet<Coupon>      Coupons      { get; set; }
    public DbSet<Influencer>  Influencers  { get; set; }
    public DbSet<PopupLead>   PopupLeads   { get; set; }
    public DbSet<StaffMember> StaffMembers { get; set; }
    public DbSet<SupplierApplication> SupplierApplications { get; set; }
    public DbSet<WishlistItem> Wishlists { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // One product can only be saved once per customer.
        modelBuilder.Entity<WishlistItem>()
            .HasIndex(w => new { w.CustomerId, w.ProductId })
            .IsUnique();

        // Unique constraints
        modelBuilder.Entity<Customer>()
            .HasIndex(c => c.CustomerCode)
            .IsUnique();

        // PERF-5: Performance indexes for common query patterns
        modelBuilder.Entity<Customer>()
            .HasIndex(c => c.Email)
            .IsUnique();
        modelBuilder.Entity<Customer>()
            .HasIndex(c => c.Phone);
        modelBuilder.Entity<SiteOrder>()
            .HasIndex(o => o.Status);
        modelBuilder.Entity<SiteOrder>()
            .HasIndex(o => o.PlacedAt);
        modelBuilder.Entity<Review>()
            .HasIndex(r => r.Status);
        modelBuilder.Entity<Review>()
            .HasIndex(r => r.ProductId);

        modelBuilder.Entity<SiteOrder>()
            .HasIndex(o => o.OrderId)
            .IsUnique();

        modelBuilder.Entity<RazorpayOrder>()
            .HasIndex(r => r.LocalOrderId)
            .IsUnique();

        modelBuilder.Entity<RazorpayOrder>()
            .HasIndex(r => r.RazorpayOrderId)
            .IsUnique();

        modelBuilder.Entity<AdminToken>()
            .HasIndex(t => t.TokenHash)
            .IsUnique();

        modelBuilder.Entity<SiteSetting>()
            .HasIndex(s => s.Key)
            .IsUnique();

        modelBuilder.Entity<Review>()
            .HasOne(r => r.Product)
            .WithMany()
            .HasForeignKey(r => r.ProductId);

        modelBuilder.Entity<Review>()
            .HasOne(r => r.Customer)
            .WithMany()
            .HasForeignKey(r => r.CustomerId);

        // JSONB columns for PostgreSQL
        modelBuilder.Entity<Product>()
            .Property(p => p.ExtraJson)
            .HasColumnType("jsonb");

        modelBuilder.Entity<SiteOrder>()
            .Property(o => o.CartJson).HasColumnType("jsonb");
        modelBuilder.Entity<SiteOrder>()
            .Property(o => o.CustomerJson).HasColumnType("jsonb");
        modelBuilder.Entity<SiteOrder>()
            .Property(o => o.ShippingJson).HasColumnType("jsonb");
        modelBuilder.Entity<SiteOrder>()
            .Property(o => o.RawJson).HasColumnType("jsonb");

        modelBuilder.Entity<RazorpayOrder>()
            .Property(r => r.CartJson).HasColumnType("jsonb");
        modelBuilder.Entity<RazorpayOrder>()
            .Property(r => r.ShippingJson).HasColumnType("jsonb");
        modelBuilder.Entity<RazorpayOrder>()
            .Property(r => r.CustomerJson).HasColumnType("jsonb");
        modelBuilder.Entity<RazorpayOrder>()
            .Property(r => r.RawOrderJson).HasColumnType("jsonb");
        modelBuilder.Entity<RazorpayOrder>()
            .Property(r => r.RawVerifyJson).HasColumnType("jsonb");
    }
}
