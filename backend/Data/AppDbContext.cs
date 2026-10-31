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
    // Superseded by RefreshTokens. Nothing reads or writes this any more: the
    // rows were opaque session tokens whose raw value was never given to the
    // client, so logging out could not find them, and no request ever checked
    // them either. Kept only so the existing table is not orphaned by code;
    // safe to drop once the old rows are of no interest.
    public DbSet<AdminToken>  AdminTokens  { get; set; }
    public DbSet<OtpToken>    OtpTokens    { get; set; }
    public DbSet<SiteSetting> SiteSettings { get; set; }
    public DbSet<Review>      Reviews      { get; set; }
    public DbSet<AppReview>   AppReviews   { get; set; }
    public DbSet<MessageSend> MessageSends { get; set; }
    public DbSet<Coupon>      Coupons      { get; set; }
    public DbSet<CouponRedemption> CouponRedemptions { get; set; }
    public DbSet<Influencer>  Influencers  { get; set; }
    public DbSet<PopupLead>   PopupLeads   { get; set; }
    public DbSet<Feedback>    Feedbacks    { get; set; }
    public DbSet<StaffMember> StaffMembers { get; set; }
    public DbSet<SupplierApplication> SupplierApplications { get; set; }
    public DbSet<WishlistItem> Wishlists   { get; set; }
    public DbSet<PushSubscription> PushSubscriptions { get; set; }
    public DbSet<MetaLead>    MetaLeads    { get; set; }
    public DbSet<GoogleLead>  GoogleLeads  { get; set; }
    public DbSet<WalletTransaction> WalletTransactions { get; set; }
    public DbSet<CustomerAddress> CustomerAddresses { get; set; }
    public DbSet<CelebrationSend> CelebrationSends { get; set; }
    public DbSet<InviteSend>  InviteSends  { get; set; }
    public DbSet<ExchangeRequest> ExchangeRequests { get; set; }
    public DbSet<StaffPayout> StaffPayouts { get; set; }
    public DbSet<SiteEventLog> SiteEventLogs { get; set; }
    public DbSet<AbandonedCart> AbandonedCarts { get; set; }
    public DbSet<OrderRefund> OrderRefunds { get; set; }
    public DbSet<RefreshToken> RefreshTokens { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

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
        // The one that is actually reachable: lookups by mobile match on the
        // last ten digits, which is an equality test. The index on Phone above
        // is kept for an exact-string match and is otherwise unused - see the
        // note on Customer.Phone10.
        modelBuilder.Entity<Customer>()
            .Property(c => c.Phone10)
            .HasComputedColumnSql(@"RIGHT(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10)", stored: true);
        modelBuilder.Entity<Customer>()
            .HasIndex(c => c.Phone10);
        modelBuilder.Entity<SiteOrder>()
            .HasIndex(o => o.Awb);
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

        // Wishlist: one row per (customer, product) so a product is saved only once.
        modelBuilder.Entity<WishlistItem>()
            .HasIndex(w => new { w.CustomerId, w.ProductId })
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
