using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;

using MahalaxmiApi.Authorization;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions _json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true, NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString };
    private static readonly string[] AllowedStatuses =
    [
        "Order Received", "Pending", "Pending confirmation", "Paid", "On Hold",
        "Order Packed", "Ready for Shipping",
        "Shipped", "Transit", "Delivered", "Return Requested", "Return Transit",
        "Return", "Cancel Requested", "Cancelled"
    ];

    private readonly IWebHostEnvironment _env;
    private readonly Services.DelhiveryService _delhivery;
    private readonly Services.AdminNotifier _notify;
    private readonly Services.SmsService _sms;
    private readonly Services.WalletService _wallet;
    private readonly IMemoryCache _cache;

    // Fraud/risk controls:
    //  • codBlockedPincodes — SiteSetting storing pincodes where COD is switched off by the store.
    //  • A customer with more than this many Cancelled orders is treated as "high risk" (red zone)
    //    and is not allowed to place COD orders.
    private const string CodBlockedKey = "codBlockedPincodes";
    private const string PublicSettingsCacheKey = "public_settings";
    private const int HighRiskCancelThreshold = 2; // > 2 (i.e. 3+) cancelled orders ⇒ high risk

    public OrdersController(AppDbContext db, IWebHostEnvironment env, Services.DelhiveryService delhivery, Services.AdminNotifier notify, Services.SmsService sms, Services.WalletService wallet, IMemoryCache cache)
    {
        _db = db;
        _env = env;
        _delhivery = delhivery;
        _notify = notify;
        _sms = sms;
        _wallet = wallet;
        _cache = cache;
    }

    // Parse a stored pincode list (any format — comma/space/JSON) into a set of 6-digit pins.
    private static HashSet<string> ParsePinList(string? raw)
    {
        var set = new HashSet<string>();
        if (string.IsNullOrWhiteSpace(raw)) return set;
        foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(raw, "\\d{6}"))
            set.Add(m.Value);
        return set;
    }

    private async Task<HashSet<string>> GetCodBlockedPincodesAsync()
    {
        var raw = await _db.SiteSettings.Where(s => s.Key == CodBlockedKey).Select(s => s.Value).FirstOrDefaultAsync();
        return ParsePinList(raw);
    }

    // How many orders this customer has had Cancelled (used for the high-risk COD rule).
    private async Task<int> CancelledCountAsync(string? customerId)
    {
        if (string.IsNullOrWhiteSpace(customerId) || customerId == "0") return 0;
        var needle = "\"id\":\"" + customerId + "\"";
        return await _db.SiteOrders.CountAsync(o =>
            o.Status == "Cancelled" && o.CustomerJson != null && o.CustomerJson.Contains(needle));
    }

    // Deploy-safe uploads root: /var/www/mahalaxmi-uploads/returns (outside repo & publish dir).
    // Derived from ContentRootPath (/var/www/mahalaxmi-backend) so it survives git reset + republish.
    private string ReturnsRoot() =>
        Path.GetFullPath(Path.Combine(_env.ContentRootPath, "..", "mahalaxmi-uploads", "returns"));

    // GET /api/orders  (Admin = all paginated; Customer = filtered at DB level)
    [HttpGet]
    [Authorize]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string? customerId,
        [FromQuery] string? email,
        [FromQuery] string? phone,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        bool isAdmin = User.HasSectionAccess("orders", "reports", "reconcile");

        // MISS-4 + PERF-1: Admin gets paginated results directly from DB
        if (isAdmin)
        {
            var adminQuery = _db.SiteOrders.OrderByDescending(o => o.PlacedAt ?? o.CreatedAt);
            var total = await adminQuery.CountAsync();
            var orders = await adminQuery
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();
            return Ok(new { success = true, orders = orders.Select(o => MapOrder(o)), total, page, pageSize });
        }

        // Customer — match orders in memory so identifiers can be NORMALISED before
        // comparison. Fragile JSON substring matching (ILike) missed legitimate orders
        // whenever the checkout email was blank/different, or the phone was stored with
        // formatting (e.g. "+91 94294 29880") so the 10 digits weren't contiguous.
        var tokenCustomerId = User.FindFirstValue("sub");
        var tokenEmail = (User.FindFirstValue("email") ?? "").Trim().ToLowerInvariant();
        var customer = int.TryParse(tokenCustomerId, out var cid)
            ? await _db.Customers.FindAsync(cid)
            : null;
        var acctPhone = NormalizePhone(customer?.Phone);

        if (cid <= 0 && string.IsNullOrEmpty(tokenEmail) && string.IsNullOrEmpty(acctPhone))
            return Ok(new { success = true, orders = Array.Empty<object>() });

        // Store scale is small; loading orders and matching in memory is fine and lets us
        // compare last-10-digit phone / case-insensitive email / exact id reliably.
        var allOrders = await _db.SiteOrders
            .OrderByDescending(o => o.PlacedAt ?? o.CreatedAt)
            .ToListAsync();

        var mine = allOrders.Where(o =>
        {
            var cj = ParseJson(o.CustomerJson);
            var orderId    = GetJsonStr(cj, "id");
            var orderEmail = (GetJsonStr(cj, "email") ?? "").Trim().ToLowerInvariant();
            var orderPhone = NormalizePhone(GetJsonStr(cj, "phone"));

            return (cid > 0 && orderId == cid.ToString())
                || (!string.IsNullOrEmpty(tokenEmail) && orderEmail == tokenEmail)
                || (!string.IsNullOrEmpty(acctPhone) && orderPhone == acctPhone);
        }).ToList();

        return Ok(new { success = true, orders = mine.Select(o => MapOrder(o)) });
    }

    // Reduce any phone string to its last 10 digits so "+91 94294 29880",
    // "9429429880" and "919429429880" all compare equal.
    private static string NormalizePhone(string? raw)
    {
        var digits = new string((raw ?? "").Where(char.IsDigit).ToArray());
        return digits.Length > 10 ? digits[^10..] : digits;
    }

    // GET /api/orders/{orderId}
    // Public so the /tracking page can look up an order by id or AWB. But order ids/AWBs are
    // guessable, so an anonymous or non-owner caller only receives shipment-safe fields
    // (id, status, AWB, courier, dates). Full customer PII / items / amounts / PAN are returned
    // ONLY to the order's owner (matched via JWT) or an admin.
    [HttpGet("{orderId}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetById(string orderId)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId || o.Awb == orderId);
        if (order is null) return NotFound(new { success = false, message = "Order not found." });

        bool full = User.HasSectionAccess("orders");
        if (!full && User.Identity?.IsAuthenticated == true)
        {
            var callerId    = User.FindFirstValue("sub");
            var callerEmail = (User.FindFirstValue("email") ?? "").Trim().ToLowerInvariant();
            var oc          = ParseJson(order.CustomerJson);
            var ownerId     = GetJsonStr(oc, "id");
            var ownerEmail  = (GetJsonStr(oc, "email") ?? "").Trim().ToLowerInvariant();
            full = (!string.IsNullOrEmpty(callerId) && callerId == ownerId)
                || (!string.IsNullOrEmpty(callerEmail) && callerEmail == ownerEmail);
        }

        var dto = MapOrder(order);
        if (!full)
        {
            // Strip everything except what the public tracking view needs.
            dto = dto with
            {
                PaymentId = null,
                Cart = new List<CartLineDto>(),
                Subtotal = 0m, ShippingCost = 0m, CodFee = 0m, Total = 0m, DiscountAmount = 0m,
                CustomerId = null, CustomerName = null, CustomerEmail = null, CustomerPhone = null,
                ShippingName = null, ShippingAddress = null, ShippingCity = null,
                ShippingPincode = null, ShippingState = null,
                PanNumber = null, PanName = null, CouponCode = null, InvoiceNumber = null,
                ReturnIssue = null, ReturnReason = null, ReturnCallback = null,
                ReturnOpeningVideo = null, ReturnClosingVideo = null,
                ReturnOpeningPhotos = null, ReturnClosingPhotos = null, ReturnRejectReason = null
            };
        }
        return Ok(new { success = true, order = dto });
    }

    // POST /api/orders  (Place order — public)
    [HttpPost]
    public async Task<IActionResult> PlaceOrder([FromBody] PlaceOrderRequest req)
    {
        var orderId = CleanOrderId(req.Id);
        var method = req.Method.ToLower().Trim();

        // GUARD: never accept an order with an empty cart. Without this, a COD submit on an
        // empty cart created a "ghost" order (₹0 goods + ₹50 COD fee, no items). Reject it here
        // BEFORE we auto-create any guest profile or write anything to the database.
        if (req.Cart is null || req.Cart.Count == 0)
            return BadRequest(new { success = false, message = "Your cart is empty. Please add items before placing an order." });

        // NOTE: the order status is decided by the server further below (after the amount is
        // recomputed and — for prepaid — the payment is verified). A client-supplied status is
        // never trusted, so a caller can't create a fake "Paid" prepaid order.

        // BUG-6: Prefer JWT sub claim over client-supplied customerId — must happen BEFORE building customerJson
        var jwtCustomerId = User.FindFirstValue("sub");
        if (!string.IsNullOrEmpty(jwtCustomerId) && jwtCustomerId != "0")
            req = req with { CustomerId = jwtCustomerId };

        // GUEST ORDER: if the buyer isn't logged in, link this order to an EXISTING account whose
        // email or mobile matches the checkout details — so the order appears in that customer's
        // profile and we don't create a duplicate identity.
        if (string.IsNullOrEmpty(req.CustomerId) || req.CustomerId == "0")
        {
            // Guest checkout: match an existing account by email/mobile, or auto-create a
            // passwordless guest profile so this and future guest orders from the same
            // mobile belong to ONE identity (and always show a customer name).
            var linkedId = await Services.CustomerLinker.FindOrCreateAsync(
                _db, req.CustomerName, req.CustomerEmail, req.CustomerPhone,
                req.ShippingAddress, req.ShippingCity, req.ShippingState, req.ShippingPincode);
            if (linkedId > 0)
                req = req with { CustomerId = linkedId.ToString() };
        }

        var cart = JsonSerializer.Serialize(req.Cart, _json);
        var customerJson = JsonSerializer.Serialize(new
        {
            id = req.CustomerId ?? "",
            name = req.CustomerName ?? "",
            email = req.CustomerEmail ?? "",
            phone = req.CustomerPhone ?? ""
        }, _json);
        var shippingJson = JsonSerializer.Serialize(new
        {
            name = req.ShippingName ?? "",
            address = req.ShippingAddress ?? "",
            city = req.ShippingCity ?? "",
            pincode = req.ShippingPincode ?? "",
            state = req.ShippingState ?? ""
        }, _json);

        // ── SECURITY: recompute stock + amounts server-side (never trust client totals) ──
        // Local Balotra delivery ships free: the per-product shipping (normally folded into
        // the price) is dropped when the shipping address is a Balotra post office / pincode.
        var shipCity = (req.ShippingCity ?? "").Trim();
        var shipPin  = new string((req.ShippingPincode ?? "").Where(char.IsDigit).ToArray());
        bool isBalotra = shipCity.IndexOf("balotra", StringComparison.OrdinalIgnoreCase) >= 0
                         || shipPin == "344022";

        // ── FRAUD / RISK: Cash-on-Delivery guards (server-side, can't be bypassed) ──
        // Only apply to COD; prepaid orders are already paid so they carry no COD risk.
        if (method == "cod")
        {
            // (a) Pincode where the store has switched COD off (too many fake/return orders).
            var blockedPins = await GetCodBlockedPincodesAsync();
            if (shipPin.Length == 6 && blockedPins.Contains(shipPin))
                return BadRequest(new { success = false, message = "Cash on Delivery isn't available for this pincode right now. Please choose online payment to place your order." });

            // (b) High-risk customer (too many past cancelled orders) — force prepaid.
            var priorCancels = await CancelledCountAsync(req.CustomerId);
            if (priorCancels > HighRiskCancelThreshold)
                return BadRequest(new { success = false, message = "Cash on Delivery isn't available for this account due to previously cancelled orders. Please pay online to place your order." });
        }

        decimal serverSubtotal = 0m;
        var cartLines = req.Cart ?? new List<CartLineDto>();
        var skus = cartLines.Select(c => (c.Sku ?? "").Trim()).Where(s => s.Length > 0).Distinct().ToList();
        var products = await _db.Products.Where(p => p.Sku != null && skus.Contains(p.Sku)).ToListAsync();
        var bySku = new Dictionary<string, Product>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in products)
        {
            var productSku = p.Sku?.Trim();
            if (!string.IsNullOrWhiteSpace(productSku))
                bySku[productSku] = p;   // last-wins (defensive vs any dup SKU)
        }
        foreach (var line in cartLines)
        {
            var qty = Math.Max(1, line.Quantity);
            var lineSku = line.Sku?.Trim();
            if (!string.IsNullOrWhiteSpace(lineSku) && bySku.TryGetValue(lineSku, out var prod))
            {
                if (string.Equals(prod.StockStatus, "Out of Stock", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(prod.StockStatus, "Inactive", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { success = false, message = $"'{prod.Name}' is out of stock. Please remove it and try again." });
                var baseUnit = prod.DiscountPrice.HasValue && prod.DiscountPrice.Value > 0 ? prod.DiscountPrice.Value : prod.Price;
                // Fold in the manual per-product shipping — unless this is a free-shipping Balotra order.
                var unit = baseUnit + (isBalotra ? 0m : Math.Max(0m, prod.ShippingCharge));
                serverSubtotal += unit * qty;
            }
            else if (!string.IsNullOrWhiteSpace(lineSku))
            {
                // SEC: a SKU was supplied but doesn't exist in the catalogue. We can't price it
                // server-side, so we must NOT trust the client's LineTotal (that was the
                // "bogus SKU + ₹1 line total" underpay hole). Reject the order instead.
                return BadRequest(new { success = false, message = "An item in your cart is no longer available. Please refresh your cart and try again." });
            }
            else
            {
                serverSubtotal += line.LineTotal;   // no SKU at all — legacy/edge line, can't verify
            }
        }

        // Re-validate the coupon server-side → trusted discount (blocks discount tampering).
        decimal serverDiscount = 0m;
        string? serverCouponCode = null;
        if (!string.IsNullOrWhiteSpace(req.CouponCode))
        {
            var code = req.CouponCode.Trim();
            var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Code.ToLower() == code.ToLower() && c.IsActive);
            var callerId = int.TryParse(req.CustomerId, out var cid) ? cid : -1;

            // Refer & Earn: the friend's discount applies only on their FIRST order — a customer
            // can benefit from a referral code just once (no reusing referral codes).
            var referralReuse = false;
            if (coupon is not null && coupon.Occasion == "referral" && callerId > 0)
                referralReuse = await _db.SiteOrders.AnyAsync(o => o.CustomerJson != null && o.CustomerJson.Contains("\"id\":\"" + callerId + "\""));

            // Influencer code: the DISCOUNT is one-per-customer, but the influencer still earns
            // commission on every order made with their code. So on a repeat use we keep the
            // attribution (store the code) but give ₹0 discount.
            var influencerDiscountUsed = false;
            if (coupon is not null && callerId > 0 && !referralReuse)
            {
                var isInfluencer = await _db.Influencers.AnyAsync(i => i.CouponCode != null && i.CouponCode.ToLower() == code.ToLower());
                if (isInfluencer)
                    influencerDiscountUsed = await _db.SiteOrders.AnyAsync(o => o.CustomerJson != null
                        && o.CustomerJson.Contains("\"id\":\"" + callerId + "\"")
                        && o.CouponCode != null && o.CouponCode.ToLower() == code.ToLower());
            }

            var valid = coupon is not null
                && (!coupon.ExpiresAt.HasValue || coupon.ExpiresAt.Value >= DateTimeOffset.UtcNow)
                && (!coupon.MaxUses.HasValue || coupon.UsedCount < coupon.MaxUses.Value)
                && serverSubtotal >= coupon.MinOrder
                && (!coupon.CustomerId.HasValue || coupon.CustomerId.Value == callerId)
                // Refer & Earn: you can't use your OWN referral code…
                && !(coupon.Occasion == "referral" && coupon.ReferrerCustomerId == callerId)
                // …and a referral code works only on a customer's first order.
                && !referralReuse;
            if (valid && coupon is not null)
            {
                // No extra discount on a repeat influencer use; full discount otherwise.
                // Percent discount is capped at the subtotal so a mis-set >100% coupon can
                // never discount more than the goods value.
                serverDiscount = influencerDiscountUsed ? 0m
                    : (coupon.Type == "percent"
                        ? Math.Min(Math.Round(serverSubtotal * coupon.Value / 100m, 2), serverSubtotal)
                        : Math.Min(coupon.Value, serverSubtotal));
                // Always attribute a valid code to the creator/influencer (commission tracking).
                serverCouponCode = coupon.Code;
            }
        }

        // Shipping is folded into item prices (or waived for Balotra) — no separate charge.
        // COD adds a flat ₹50 handling fee, enforced SERVER-SIDE (the client value is never
        // trusted): COD orders always pay exactly ₹50 extra; prepaid orders never get a COD fee.
        decimal serverShipping = 0m;
        decimal serverCodFee   = method == "cod" ? 50m : 0m;
        decimal serverTotal    = Math.Max(0m, serverSubtotal + serverShipping + serverCodFee - serverDiscount);

        // ── WALLET REDEMPTION: validate how much of this order the customer pays from their
        // loyalty wallet. Capped at (a) their actual balance and (b) loyaltyRedeemMaxPercent of
        // the order. The order's sale value stays serverTotal; only the amount COLLECTED
        // externally (gateway/COD) drops by the wallet portion. Guests can't redeem.
        decimal walletApplied = 0m;
        int walletCustId = 0;
        if (req.WalletUsed > 0 && int.TryParse(req.CustomerId, out var _wc) && _wc > 0)
        {
            var wEnabled = (await _db.SiteSettings.Where(s => s.Key == "loyaltyEnabled")
                .Select(s => s.Value).FirstOrDefaultAsync() ?? "true").Trim().ToLowerInvariant();
            if (wEnabled == "true" || wEnabled == "1")
            {
                var bal = await _db.Customers.Where(c => c.Id == _wc).Select(c => c.WalletBalance).FirstOrDefaultAsync();
                var maxPctStr = await _db.SiteSettings.Where(s => s.Key == "loyaltyRedeemMaxPercent")
                    .Select(s => s.Value).FirstOrDefaultAsync();
                decimal.TryParse(maxPctStr, out var maxPct);
                if (maxPct <= 0) maxPct = 20m;
                var cap = Math.Round(serverTotal * maxPct / 100m, 2);
                var maxAllowed = Math.Min(Math.Min(bal, cap), serverTotal);
                walletApplied = Math.Round(Math.Max(0m, Math.Min(req.WalletUsed, maxAllowed)), 2);
                walletCustId = _wc;
            }
        }
        decimal amountToCollect = Math.Max(0m, serverTotal - walletApplied);

        // ── PAYMENT GATE ──────────────────────────────────────────────────────────────
        // The server decides the status. COD always starts "Pending". A prepaid order is
        // only accepted if a Razorpay order for this same local id has actually been marked
        // "paid" (via /payments/verify or the webhook) AND the amount captured is not less
        // than the total we computed here. This blocks (a) fake "Paid" prepaid orders placed
        // without paying, and (b) total-tampering where the customer pays less than they owe.
        string finalStatus;
        if (method == "cod")
        {
            finalStatus = "Pending";
        }
        else if (method == "cashfree")
        {
            // Cashfree gate: order must be marked paid (via /cashfree/verify or webhook)
            // and the captured amount must cover the server-computed total.
            var cfOrder = await _db.CashfreeOrders.FirstOrDefaultAsync(c => c.LocalOrderId == orderId);
            if (cfOrder is null || cfOrder.Status != "paid")
                return BadRequest(new { success = false, message = "Payment could not be verified for this order." });

            var expectedPaiseCf = (int)Math.Round(amountToCollect * 100m, MidpointRounding.AwayFromZero);
            if (expectedPaiseCf - cfOrder.AmountPaise > 100)
                return BadRequest(new { success = false, message = "Payment amount does not match the order total." });

            finalStatus = "Pending";
        }
        else
        {
            var rp = await _db.RazorpayOrders.FirstOrDefaultAsync(r => r.LocalOrderId == orderId);
            if (rp is null || rp.Status != "paid")
                return BadRequest(new { success = false, message = "Payment could not be verified for this order." });

            var expectedPaise = (int)Math.Round(amountToCollect * 100m, MidpointRounding.AwayFromZero);
            // Only block genuine underpayment (≥ ₹1 short). Paying the same or more — e.g. a
            // Balotra free-shipping order the client didn't discount — is fine.
            if (expectedPaise - rp.AmountPaise > 100)
                return BadRequest(new { success = false, message = "Payment amount does not match the order total." });

            finalStatus = "Pending";
        }

        // Everything from here to SaveChanges runs in ONE transaction so the coupon
        // consume, stock deduction (row-locked) and order insert commit atomically.
        await using var tx = await _db.Database.BeginTransactionAsync();

        var existing = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        // Razorpay webhook race: agar webhook ne pehle hi recovery order bana diya
        // (browser slow tha), to usi order ko yahan complete karo — duplicate nahi.
        if (existing is null && !string.IsNullOrWhiteSpace(req.PaymentId))
            existing = await _db.SiteOrders.FirstOrDefaultAsync(o => o.PaymentId == req.PaymentId);
        var isWebhookRecovery = existing?.RawJson is not null && existing.RawJson.Contains("webhook_recovery");
        if (existing is not null)
        {
            orderId = existing.OrderId;   // respond with the order we actually updated

            // CQ-5: Never re-open a finalized order (webhook-recovery "Paid" placeholder is the
            // one exception — the customer's real PlaceOrder call fills in its details once).
            if (!isWebhookRecovery && existing.Status is "Paid" or "Delivered" or "Cancelled")
                return Conflict(new { success = false, message = $"Order is already {existing.Status} and cannot be modified." });

            if (isWebhookRecovery)
                existing.RawJson = null;   // marker consumed — future updates blocked as usual

            existing.Method = method;
            existing.Status = finalStatus;
            existing.PaymentId = req.PaymentId;
            existing.Subtotal = serverSubtotal;
            existing.ShippingCost = serverShipping;
            existing.CodFee = serverCodFee;
            existing.Total = serverTotal;
            existing.WalletUsed = walletApplied;
            existing.CartJson = cart;
            existing.CustomerJson = customerJson;
            existing.ShippingJson = shippingJson;
            existing.PlacedAt = DateTimeOffset.UtcNow;   // server time — never trust client PlacedAt
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            // Consume the coupon ATOMICALLY before storing the order. This single UPDATE both
            // increments used_count AND re-checks the cap in one statement, so two concurrent
            // orders can never both slip past a MaxUses limit (the old read-then-write could).
            if (!string.IsNullOrWhiteSpace(serverCouponCode))
            {
                var rows = await _db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE coupons SET used_count = used_count + 1 WHERE lower(code) = lower({serverCouponCode}) AND (max_uses IS NULL OR used_count < max_uses)");

                if (rows == 0)
                {
                    // The coupon just hit its usage cap via a concurrent order. For COD we drop the
                    // discount (nothing charged yet); for a prepaid order the customer has already
                    // paid the discounted amount, so we honour the order as placed.
                    if (method == "cod")
                    {
                        serverDiscount   = 0m;
                        serverTotal      = Math.Max(0m, serverSubtotal + serverShipping + serverCodFee);
                        serverCouponCode = null;
                    }
                }
                else
                {
                    // Coupon consumed. A birthday/anniversary offer also locks that occasion.
                    var occasion = await _db.Coupons
                        .Where(c => c.Code.ToLower() == serverCouponCode!.ToLower())
                        .Select(c => c.Occasion).FirstOrDefaultAsync();
                    if ((occasion == "birthday" || occasion == "anniversary")
                        && int.TryParse(req.CustomerId, out var cid) && cid > 0)
                    {
                        var buyer = await _db.Customers.FindAsync(cid);
                        if (buyer is not null)
                        {
                            if (occasion == "birthday") buyer.BirthdayOfferUsed = true;
                            else buyer.AnniversaryOfferUsed = true;
                            buyer.UpdatedAt = DateTimeOffset.UtcNow;
                        }
                    }
                }
            }

            _db.SiteOrders.Add(new SiteOrder
            {
                OrderId = orderId,
                Method = method,
                Status = finalStatus,
                PaymentId = req.PaymentId,
                Subtotal = serverSubtotal,
                ShippingCost = serverShipping,
                CodFee = serverCodFee,
                Total = serverTotal,
                CartJson = cart,
                CustomerJson = customerJson,
                ShippingJson = shippingJson,
                PlacedAt = DateTimeOffset.UtcNow,   // server time — never trust client PlacedAt
                // MISS-6: Store PAN details
                PanNumber = req.PanNumber?.Trim().ToUpper(),
                PanName = req.PanName?.Trim(),
                // Coupon (only the server-validated code/discount is stored)
                CouponCode = serverCouponCode,
                DiscountAmount = serverDiscount,
                WalletUsed = walletApplied,
            });
        }

        // ── STOCK: deduct variant qty for fresh orders (and webhook-recovery completion).
        // Rows are locked FOR UPDATE inside this transaction, so concurrent checkouts
        // can't oversell. COD me insufficient stock par order reject hota hai; prepaid
        // me paisa already capture ho chuka hai isliye order accept hota hai aur qty 0
        // par clamp ho jati hai (admin ko 'Out of Stock' dikh jayega).
        if (existing is null || isWebhookRecovery)
        {
            var shortNames = await Services.StockHelper.DeductAsync(_db, cartLines);
            if (shortNames.Count > 0 && method == "cod")
            {
                await tx.RollbackAsync();
                return Conflict(new { success = false, message = $"'{shortNames[0]}' just went out of stock. Please update your cart and try again." });
            }
        }

        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        // WALLET: settle the wallet portion once the order is safely committed. Idempotent — a
        // retried PlaceOrder for the same order never debits the wallet twice.
        if (walletApplied > 0 && walletCustId > 0)
        {
            try
            {
                var alreadyRedeemed = await _db.WalletTransactions.AnyAsync(t => t.Type == "redeem" && t.OrderId == orderId);
                if (!alreadyRedeemed)
                    await _wallet.MoveAsync(walletCustId, -walletApplied, "redeem", orderId, $"Used at checkout on order {orderId}");
            }
            catch { /* best-effort; the order is already placed */ }
        }

        // Notify admin of the new order (email — fire-and-forget, never blocks the response).
        var itemsSummary = string.Join(", ", (req.Cart ?? new List<CartLineDto>()).Take(6).Select(c => $"{c.Name} x{Math.Max(1, c.Quantity)}"));
        await _notify.NotifyAsync($"New Order {orderId} - Rs.{serverTotal:0}",
            Services.AdminNotifier.Wrap("New Order Received", $@"
                <p><strong>Order:</strong> {orderId}</p>
                <p><strong>Amount:</strong> Rs.{serverTotal:0} ({method.ToUpper()})</p>
                <p><strong>Customer:</strong> {System.Net.WebUtility.HtmlEncode(req.CustomerName ?? "")} &middot; {System.Net.WebUtility.HtmlEncode(req.CustomerPhone ?? "")}</p>
                <p><strong>Ship to:</strong> {System.Net.WebUtility.HtmlEncode(req.ShippingAddress ?? "")}, {System.Net.WebUtility.HtmlEncode(req.ShippingCity ?? "")} - {System.Net.WebUtility.HtmlEncode(req.ShippingPincode ?? "")}</p>
                <p><strong>Items:</strong> {System.Net.WebUtility.HtmlEncode(itemsSummary)}</p>"));

        // Customer "New Order" SMS (MSG91) — only for freshly created orders
        // (webhook-recovery completion bhi customer ke liye naya order hi hai).
        // No-op until msg91OrderTemplateId is configured in Settings; never throws.
        if (existing is null || isWebhookRecovery)
            await _sms.SendNewOrderSmsAsync(req.CustomerPhone, orderId, serverTotal);

        // GA4 server-side 'purchase' — guarantees every order is counted in Analytics even
        // when the buyer's browser blocked gtag / paid via the app / UPI redirect. GA4 dedupes
        // by transaction_id, so this never double-counts the client-side event. No-op until
        // ga4ApiSecret is set in Settings; never throws (best-effort analytics).
        if (existing is null || isWebhookRecovery)
        {
            var ga4Secret = await _db.SiteSettings.Where(s => s.Key == "ga4ApiSecret")
                .Select(s => s.Value).FirstOrDefaultAsync() ?? "";
            if (!string.IsNullOrWhiteSpace(ga4Secret))
            {
                var ga4Mid = (await _db.SiteSettings.Where(s => s.Key == "ga4MeasurementId")
                    .Select(s => s.Value).FirstOrDefaultAsync()) ?? "G-SFMFYD4NE6";
                if (string.IsNullOrWhiteSpace(ga4Mid)) ga4Mid = "G-SFMFYD4NE6";

                var ga4Items = (req.Cart ?? new List<CartLineDto>())
                    .Select(c => (
                        id: (c.Sku ?? "").Trim(),
                        name: (c.Name ?? "").Trim(),
                        qty: Math.Max(1, c.Quantity),
                        price: c.Price))
                    .ToList();

                await Services.Ga4Mp.SendPurchaseAsync(
                    ga4Mid, ga4Secret, req.GaClientId, orderId, serverTotal, "INR", ga4Items);
            }
        }

        return Ok(new { success = true, orderId });
    }

    // DELETE /api/orders/{orderId}  (Admin only — permanently removes an order).
    // Used to clear out test orders. Also removes any linked payment-gateway rows and
    // return-media folder so nothing is left orphaned.
    [HttpDelete("{orderId}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DeleteOrder(string orderId)
    {
        var id = CleanOrderId(orderId);
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == id);
        if (order is null) return NotFound(new { success = false, message = "Order not found" });

        var rz = await _db.RazorpayOrders.Where(r => r.LocalOrderId == id).ToListAsync();
        if (rz.Count > 0) _db.RazorpayOrders.RemoveRange(rz);
        var cf = await _db.CashfreeOrders.Where(c => c.LocalOrderId == id).ToListAsync();
        if (cf.Count > 0) _db.CashfreeOrders.RemoveRange(cf);

        _db.SiteOrders.Remove(order);
        await _db.SaveChangesAsync();

        try { DeleteReturnMediaDir(id); } catch { /* best-effort cleanup */ }

        return Ok(new { success = true, orderId = id });
    }

    // PATCH /api/orders/status  (Admin only)
    [HttpPatch("status")]
    [Authorize]
    [RequirePerm("orders")]
    public async Task<IActionResult> UpdateStatus([FromBody] AdminUpdateOrderRequest req)
    {
        if (!AllowedStatuses.Contains(req.Status))
            return BadRequest(new { success = false, message = "Invalid status." });

        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == req.OrderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        // Safeguard: don't let a forward-shipping status overwrite a return in progress
        // (that would silently pull the order out of the Returns queue). Override with Force.
        var returnStatuses  = new[] { "Return Requested", "Return Transit", "Return" };
        var forwardShipping = new[] { "Ready for Shipping", "Shipped", "Delivered" };
        if (!req.Force
            && returnStatuses.Contains(order.Status, StringComparer.OrdinalIgnoreCase)
            && forwardShipping.Contains(req.Status, StringComparer.OrdinalIgnoreCase))
        {
            return Conflict(new { success = false, message =
                $"Order {order.OrderId} is in a return flow ({order.Status}); it can't be marked \"{req.Status}\". Use the return actions instead." });
        }

        // STOCK RESTORE: order Cancelled/Return hote hi cart ki quantities wapas
        // variantMatrix me jud jati hain (sirf pehli baar — dobara same status pe nahi).
        var wasReturnedOrCancelled = order.Status is "Cancelled" or "Return";
        var nowReturnedOrCancelled = req.Status is "Cancelled" or "Return";
        if (!wasReturnedOrCancelled && nowReturnedOrCancelled)
            await Services.StockHelper.RestoreAsync(_db, order.CartJson);

        order.Status = req.Status;
        if (req.Awb is not null)
            order.Awb = new string(req.Awb.Where(char.IsLetterOrDigit).ToArray());
        if (!string.IsNullOrWhiteSpace(req.Courier))
            order.Courier = req.Courier.Trim();
        // BUG-2: Record exact delivery time for accurate return window calculation
        var justDelivered = string.Equals(req.Status, "Delivered", StringComparison.OrdinalIgnoreCase) && order.DeliveredAt is null;
        if (justDelivered)
            order.DeliveredAt = DateTimeOffset.UtcNow;

        order.UpdatedAt = DateTimeOffset.UtcNow;

        // Assign a GST invoice number once the order is confirmed for shipping — at
        // "Ready for Shipping" or any later stage — if it doesn't already have one.
        var invoiceStatuses = new[] { "Ready for Shipping", "Shipped", "Transit", "Delivered" };
        var needsInvoice = invoiceStatuses.Contains(req.Status, StringComparer.OrdinalIgnoreCase)
                           && string.IsNullOrEmpty(order.InvoiceNumber);

        if (needsInvoice)
        {
            // Serialise invoice numbering with a transaction-scoped advisory lock (keyed on the
            // financial year) so two concurrent "Ready for Shipping" updates can never be handed
            // the SAME GST number. The lock is held until the new number is committed, then auto-released.
            var prefix = InvoicePrefix();
            await using var tx = await _db.Database.BeginTransactionAsync();
            await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({prefix}))");
            order.InvoiceNumber = await NextInvoiceNumberAsync(prefix);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        else
        {
            await _db.SaveChangesAsync();
        }

        // LOYALTY: credit the buyer's wallet the first time an order is marked Delivered.
        // Reward is a % of the merchandise paid (total minus shipping & COD fee), so shipping
        // charges aren't rewarded. No-op for guest orders or when loyalty is turned off.
        if (justDelivered)
        {
            try
            {
                var enabled = (await _db.SiteSettings.Where(s => s.Key == "loyaltyEnabled")
                    .Select(s => s.Value).FirstOrDefaultAsync() ?? "true").Trim().ToLowerInvariant();
                if (enabled == "true" || enabled == "1")
                {
                    var pctStr = await _db.SiteSettings.Where(s => s.Key == "loyaltyEarnPercent")
                        .Select(s => s.Value).FirstOrDefaultAsync();
                    decimal.TryParse(pctStr, out var pct);
                    if (pct <= 0) pct = 5m;

                    var custId = GetJsonStr(ParseJson(order.CustomerJson), "id");
                    if (int.TryParse(custId, out var cid) && cid > 0)
                    {
                        var goods = order.Total - order.ShippingCost - order.CodFee;
                        var reward = Math.Round(Math.Max(0, goods) * pct / 100m, 2);
                        if (reward > 0)
                            await _wallet.MoveAsync(cid, reward, "earn", order.OrderId,
                                $"Loyalty {pct:0.##}% on delivered order {order.OrderId}");
                    }
                }
            }
            catch { /* loyalty is best-effort — never block a status update */ }
        }

        // REFER & EARN: if this delivered order used a customer's referral code, credit the
        // referrer's wallet (once). Self-referrals are blocked at checkout and double-guarded here.
        if (justDelivered && !string.IsNullOrWhiteSpace(order.CouponCode))
        {
            try
            {
                var refEnabled = (await _db.SiteSettings.Where(s => s.Key == "referralEnabled")
                    .Select(s => s.Value).FirstOrDefaultAsync() ?? "true").Trim().ToLowerInvariant();
                if (refEnabled == "true" || refEnabled == "1")
                {
                    var refCoupon = await _db.Coupons.FirstOrDefaultAsync(
                        c => c.Code.ToLower() == order.CouponCode!.ToLower() && c.Occasion == "referral");
                    if (refCoupon?.ReferrerCustomerId is int referrerId && referrerId > 0)
                    {
                        var buyerId = GetJsonStr(ParseJson(order.CustomerJson), "id");
                        var isSelf = int.TryParse(buyerId, out var bId) && bId == referrerId;
                        var already = await _db.WalletTransactions.AnyAsync(t => t.Type == "referral" && t.OrderId == order.OrderId);
                        if (!isSelf && !already)
                        {
                            decimal.TryParse(await _db.SiteSettings.Where(s => s.Key == "referralReferrerReward")
                                .Select(s => s.Value).FirstOrDefaultAsync(), out var refReward);
                            if (refReward <= 0) refReward = 100m;
                            await _wallet.MoveAsync(referrerId, refReward, "referral", order.OrderId,
                                $"Referral reward — a friend's order {order.OrderId} was delivered");
                        }
                    }
                }
            }
            catch { /* best-effort */ }
        }

        // WALLET: when an order is Cancelled/Returned for the first time, put any wallet amount
        // the customer spent on it back into their wallet.
        if (!wasReturnedOrCancelled && nowReturnedOrCancelled)
        {
            try { await RefundWalletForOrderAsync(order); } catch { /* best-effort */ }
        }

        return Ok(new { success = true, order = MapOrder(order) });
    }

    // Return the wallet amount spent on an order back to the customer (once). Safe to call more
    // than once — the refund is recorded only if it hasn't been already.
    private async Task RefundWalletForOrderAsync(SiteOrder order)
    {
        if (order.WalletUsed <= 0) return;
        var custId = GetJsonStr(ParseJson(order.CustomerJson), "id");
        if (!int.TryParse(custId, out var cid) || cid <= 0) return;
        if (await _db.WalletTransactions.AnyAsync(t => t.Type == "refund" && t.OrderId == order.OrderId)) return;
        await _wallet.MoveAsync(cid, order.WalletUsed, "refund", order.OrderId, $"Wallet refund for {order.Status.ToLower()} order {order.OrderId}");
    }

    // GET /api/orders/{orderId}/invoice — customer-downloadable HTML bill/invoice.
    // Valid for 12 months from the order date; after that an "expired" page is returned.
    [HttpGet("{orderId}/invoice")]
    [Authorize]
    public async Task<IActionResult> Invoice(string orderId)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        // SEC-4 IDOR — only the buyer (or an admin) may download the invoice.
        if (!User.HasSectionAccess("orders"))
        {
            var callerId = User.FindFirstValue("sub");
            var callerEmail = User.FindFirstValue("email");
            var cj0 = ParseJson(order.CustomerJson);
            var orderCustomerId = GetJsonStr(cj0, "id");
            var orderEmail = GetJsonStr(cj0, "email");
            if (callerId != orderCustomerId &&
                !string.Equals(callerEmail, orderEmail, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        var placedAt = order.PlacedAt ?? order.CreatedAt;
        var expired = DateTimeOffset.UtcNow - placedAt > TimeSpan.FromDays(365);
        var html = expired ? BuildInvoiceExpiredHtml(order.OrderId) : BuildInvoiceHtml(order);
        return Content(html, "text/html; charset=utf-8");
    }

    private string BuildInvoiceHtml(SiteOrder o)
    {
        var cj = ParseJson(o.CustomerJson);
        var sj = ParseJson(o.ShippingJson);
        var lines = string.IsNullOrEmpty(o.CartJson)
            ? new List<CartLineDto>()
            : (JsonSerializer.Deserialize<List<CartLineDto>>(o.CartJson, _json) ?? new List<CartLineDto>());

        var placed = (o.PlacedAt ?? o.CreatedAt).ToOffset(TimeSpan.FromHours(5.5));

        string name = GetJsonStr(sj, "name") ?? "";
        if (string.IsNullOrWhiteSpace(name)) name = GetJsonStr(cj, "name") ?? "";
        string phone = GetJsonStr(sj, "phone") ?? "";
        if (string.IsNullOrWhiteSpace(phone)) phone = GetJsonStr(cj, "phone") ?? "";
        string addr = GetJsonStr(sj, "address") ?? "";
        string city = GetJsonStr(sj, "city") ?? "";
        string state = GetJsonStr(sj, "state") ?? "";
        string pin = GetJsonStr(sj, "pincode") ?? "";
        string invNo = string.IsNullOrWhiteSpace(o.InvoiceNumber) ? o.OrderId : o.InvoiceNumber!;
        string awb = string.IsNullOrWhiteSpace(o.Awb) ? "Pending" : o.Awb!;

        // Store prices are GST-inclusive, so back-calculate the taxable value + tax for each line.
        decimal firstRate = (lines.Count > 0 && lines[0].GstRate > 0) ? lines[0].GstRate : 5m;
        decimal taxableTotal = 0m, taxTotal = 0m;

        var rows = new System.Text.StringBuilder();
        int idx = 1;
        foreach (var l in lines)
        {
            decimal rate = l.GstRate > 0 ? l.GstRate : 5m;
            decimal lineIncl = l.LineTotal;
            decimal lineTaxable = rate > 0 ? lineIncl / (1 + rate / 100m) : lineIncl;
            decimal lineTax = lineIncl - lineTaxable;
            int qty = Math.Max(1, l.Quantity);
            decimal unitRate = lineTaxable / qty;
            taxableTotal += lineTaxable;
            taxTotal += lineTax;

            var itemName = System.Net.WebUtility.HtmlEncode(l.Name ?? "Item");
            var sku = System.Net.WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(l.Sku) ? "-" : l.Sku);
            var size = System.Net.WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(l.Size) ? "Free Size" : l.Size);
            var colour = string.IsNullOrWhiteSpace(l.Color) ? "" : " | Colour: " + System.Net.WebUtility.HtmlEncode(l.Color);
            var hsnLine = System.Net.WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(l.Hsn) ? "6211" : l.Hsn);
            rows.Append(
                "<tr>" +
                "<td class='c'>" + idx + "</td>" +
                "<td><div class='inm'>" + itemName + "</div><div class='ism'>SKU: " + sku + " &bull; Size: " + size + colour + "</div></td>" +
                "<td class='c'>" + hsnLine + "</td>" +
                "<td class='c gold'>" + qty + "</td>" +
                "<td class='r gold'>&#8377;" + unitRate.ToString("0.00") + "</td>" +
                "<td class='c gold'>" + rate.ToString("0.#") + "%</td>" +
                "<td class='r'>&#8377;" + lineTax.ToString("0.00") + "</td>" +
                "<td class='r'>&#8377;" + lineIncl.ToString("0.00") + "</td>" +
                "</tr>");
            idx++;
        }

        decimal cgst = taxTotal / 2m;
        decimal halfRate = firstRate / 2m;

        var extraRows = new System.Text.StringBuilder();
        if (o.DiscountAmount > 0)
            extraRows.Append("<tr><td class='k'>Discount"
                + (string.IsNullOrWhiteSpace(o.CouponCode) ? "" : " (" + System.Net.WebUtility.HtmlEncode(o.CouponCode) + ")")
                + "</td><td class='v'>-&#8377;" + o.DiscountAmount.ToString("0.00") + "</td></tr>");
        if (o.CodFee > 0)
            extraRows.Append("<tr><td class='k'>COD Charges</td><td class='v gold'>&#8377;" + o.CodFee.ToString("0.00") + "</td></tr>");

        var addrFull = System.Net.WebUtility.HtmlEncode(string.Join(", ",
            new[] { addr, city, state, pin }.Where(x => !string.IsNullOrWhiteSpace(x))));
        var payLabel = string.Equals(o.Method, "cod", StringComparison.OrdinalIgnoreCase) ? "Cash on Delivery (COD)" : "Prepaid (Online)";
        string shipDisp = o.ShippingCost > 0 ? "&#8377;" + o.ShippingCost.ToString("0.00") : "-";

        return INVOICE_TEMPLATE
            .Replace("{INVNO}", System.Net.WebUtility.HtmlEncode(invNo))
            .Replace("{DATE}", placed.ToString("dd-MM-yyyy"))
            .Replace("{ORDERNO}", System.Net.WebUtility.HtmlEncode(o.OrderId))
            .Replace("{METHOD}", payLabel)
            .Replace("{AWB}", System.Net.WebUtility.HtmlEncode(awb))
            .Replace("{NAME}", System.Net.WebUtility.HtmlEncode(name))
            .Replace("{PHONE}", System.Net.WebUtility.HtmlEncode(phone))
            .Replace("{ADDR}", addrFull)
            .Replace("{ROWS}", rows.ToString())
            .Replace("{EXTRAROWS}", extraRows.ToString())
            .Replace("{TAXABLE}", taxableTotal.ToString("0.00"))
            .Replace("{HALFRATE}", halfRate.ToString("0.##"))
            .Replace("{CGST}", cgst.ToString("0.00"))
            .Replace("{SGST}", cgst.ToString("0.00"))
            .Replace("{SHIP}", shipDisp)
            .Replace("{TOTAL}", o.Total.ToString("0.00"))
            .Replace("{WORDS}", System.Net.WebUtility.HtmlEncode(AmountInWords(o.Total)))
            .Replace("{YEAR}", placed.Year.ToString());
    }

    // Indian-format amount in words, e.g. 1572.90 -> "Rupees One Thousand Five Hundred Seventy-Two and Ninety Paise Only".
    private static string AmountInWords(decimal amount)
    {
        long rupees = (long)Math.Floor(amount);
        int paise = (int)Math.Round((amount - rupees) * 100m, MidpointRounding.AwayFromZero);
        if (paise == 100) { rupees += 1; paise = 0; }
        var sb = new System.Text.StringBuilder();
        sb.Append("Rupees ").Append(NumToWords(rupees));
        if (paise > 0) sb.Append(" and ").Append(NumToWords(paise)).Append(" Paise");
        sb.Append(" Only");
        return sb.ToString();
    }

    private static readonly string[] _ones = { "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
    private static readonly string[] _tens = { "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };

    private static string TwoDigits(long x)
    {
        if (x < 20) return _ones[(int)x];
        return (_tens[(int)(x / 10)] + (x % 10 != 0 ? " " + _ones[(int)(x % 10)] : "")).Trim();
    }

    private static string ThreeDigits(long x)
    {
        var r = "";
        if (x >= 100) { r += _ones[(int)(x / 100)] + " Hundred"; x %= 100; if (x != 0) r += " "; }
        if (x > 0) r += TwoDigits(x);
        return r;
    }

    private static string NumToWords(long n)
    {
        if (n == 0) return "Zero";
        var parts = new System.Text.StringBuilder();
        long crore = n / 10000000; n %= 10000000;
        long lakh = n / 100000; n %= 100000;
        long thou = n / 1000; n %= 1000;
        long hund = n;
        if (crore > 0) parts.Append(NumToWords(crore)).Append(" Crore ");
        if (lakh > 0) parts.Append(TwoDigits(lakh)).Append(" Lakh ");
        if (thou > 0) parts.Append(TwoDigits(thou)).Append(" Thousand ");
        if (hund > 0) parts.Append(ThreeDigits(hund));
        return parts.ToString().Trim();
    }

    private static string BuildInvoiceExpiredHtml(string orderId)
    {
        return "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<title>Invoice expired</title></head>"
            + "<body style=\"font-family:sans-serif;background:#faf7f4;text-align:center;padding:14vh 1rem;color:#5c1a28;\">"
            + "<div style=\"max-width:460px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:16px;padding:2rem;box-shadow:0 10px 30px rgba(0,0,0,.08);\">"
            + "<div style=\"font-size:3rem;\">&#128220;</div>"
            + "<h1 style=\"color:#7a0a22;font-size:1.3rem;margin:.4rem 0;\">Invoice Expired</h1>"
            + "<p style=\"color:#666;font-size:.95rem;line-height:1.6;\">The downloadable invoice for order <b>" + System.Net.WebUtility.HtmlEncode(orderId) + "</b> is only available for <b>12 months</b> from the order date. This period has now passed.</p>"
            + "<p style=\"color:#888;font-size:.85rem;\">Need a copy? Contact us on WhatsApp: <b>+91 9429429880</b>.</p>"
            + "</div></body></html>";
    }

    private const string INVOICE_TEMPLATE = @"<!DOCTYPE html>
<html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Tax Invoice {INVNO} - Mahalaxmi Fashion Hub</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;background:#eceae4;color:#2b2b2b;margin:0;padding:14px;font-size:11px}
  .bar{max-width:820px;margin:0 auto 10px;text-align:right}
  .bar button{background:#c19a4e;color:#fff;border:none;border-radius:7px;padding:.5rem 1.1rem;font-weight:700;font-size:12px;cursor:pointer}
  .sheet{max-width:820px;margin:0 auto;background:#fff;padding:22px 24px}
  .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
  .hd .l{flex:1.25}
  .hd .l img{height:56px;width:auto;display:block}
  .hd .l .addr{font-size:10px;color:#333;line-height:1.5;margin-top:6px;border-top:1px solid #e6ddc9;padding-top:5px}
  .hd .l .addr b{color:#111}
  .hd .c{flex:1;text-align:center;padding-top:16px}
  .hd .c .ti{font-family:Georgia,serif;font-size:22px;font-weight:800;color:#b8892f;letter-spacing:.05em}
  .hd .r{flex:1.05}
  .hd .r .no,.hd .r .dt{font-size:11px;font-weight:700;text-align:right}
  .hd .r .dt{margin:4px 0 6px}
  .metabox{border:1px solid #e0d6bf}
  .metabox .row{display:flex;border-top:1px solid #ede6d5;font-size:10px}
  .metabox .row:first-child{border-top:none}
  .metabox .k{width:46%;padding:4px 7px;color:#555;font-weight:700;border-right:1px solid #ede6d5}
  .metabox .v{flex:1;padding:4px 7px}
  .bs{display:flex;gap:16px;margin-top:16px}
  .bs>div{flex:1}
  .sect{background:#f3ead3;color:#8a6a2f;font-size:10px;font-weight:800;letter-spacing:.04em;padding:4px 8px;text-transform:uppercase}
  .bs .body{font-size:10.5px;line-height:1.6;padding:7px 8px 0;color:#333}
  .bs .body b{color:#111;font-size:11.5px}
  .bs .body .g{color:#888}
  table.it{width:100%;border-collapse:collapse;margin-top:16px}
  table.it thead th{background:#1a1a1a;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;padding:7px 6px;text-align:left}
  table.it tbody td{padding:7px 6px;border-bottom:1px solid #eee;font-size:10.5px;vertical-align:top}
  table.it td.c{text-align:center}table.it td.r{text-align:right}
  .inm{font-weight:700;color:#222;line-height:1.25}
  .ism{font-size:9px;color:#888;margin-top:2px}
  .gold{color:#b8892f;font-weight:700}
  .tot{width:300px;margin-left:auto;border-collapse:collapse;margin-top:12px}
  .tot td{padding:5px 9px;font-size:11px;border-bottom:1px solid #eee}
  .tot td.k{color:#555}.tot td.v{text-align:right;font-weight:700}
  .tot tr.grand td{background:#c19a4e;color:#fff;font-size:13px;font-weight:800;border:none}
  .words{font-size:11px;margin-top:12px;border-top:1px solid #eee;padding-top:8px}
  .words b{color:#b8892f}
  .cc{display:flex;gap:16px;margin-top:16px}
  .cc>div{flex:1}
  .cc .body{font-size:9.5px;color:#555;line-height:1.85;padding:6px 8px 0}
  .thanks{text-align:center;margin-top:20px}
  .thanks .ty{font-family:Georgia,serif;font-style:italic;font-size:17px;color:#b8892f;font-weight:700}
  .thanks .links{font-size:10px;color:#555;margin-top:7px}
  .thanks .fine{font-size:9px;color:#999;margin-top:5px;line-height:1.6}
  .brandline{text-align:center;font-size:9px;color:#aaa;margin-top:16px;border-top:1px solid #eee;padding-top:8px}
  @page{size:A4;margin:10mm}
  @media print{body{background:#fff;padding:0}.bar{display:none}.sheet{max-width:100%;padding:6mm}}
</style></head>
<body>
  <div class='bar'><button onclick='window.print()'>&#128190; Download / Print Invoice (PDF)</button></div>
  <div class='sheet'>
    <div class='hd'>
      <div class='l'>
        <img src='https://www.mahalaxmifashionhub.com/email-logo.png' alt='Mahalaxmi Fashion Hub'>
        <div class='addr'>Ward No. 45, Prajapat Nagar, Near Ex MLA Niwas<br>Balotra, Rajasthan - 344022 &nbsp; GSTIN: <b>08MUEPS5079K1ZM</b></div>
      </div>
      <div class='c'><div class='ti'>TAX INVOICE</div></div>
      <div class='r'>
        <div class='no'>Invoice No.: <b>{INVNO}</b></div>
        <div class='dt'>Date: {DATE}</div>
        <div class='metabox'>
          <div class='row'><div class='k'>Order ID</div><div class='v'>{ORDERNO}</div></div>
          <div class='row'><div class='k'>Payment</div><div class='v'>{METHOD}</div></div>
          <div class='row'><div class='k'>Transport / AWB</div><div class='v'>{AWB}</div></div>
        </div>
      </div>
    </div>
    <div class='bs'>
      <div>
        <div class='sect'>Billing &amp; Address</div>
        <div class='body'><b>{NAME}</b><br>{ADDR}<br>Phone: {PHONE} &nbsp; <span class='g'>GSTIN: Unregistered</span></div>
      </div>
      <div>
        <div class='sect'>Shipping Address</div>
        <div class='body'><b>{NAME}</b><br>{ADDR}<br>Phone: {PHONE}</div>
      </div>
    </div>
    <table class='it'>
      <thead><tr><th style='width:26px'>#</th><th>Item Description</th><th style='width:50px'>HSN</th><th style='width:32px'>Qty</th><th style='width:74px;text-align:right'>Rate (&#8377;)</th><th style='width:44px;text-align:center'>GST %</th><th style='width:80px;text-align:right'>Tax Amount (&#8377;)</th><th style='width:80px;text-align:right'>Amount (&#8377;)</th></tr></thead>
      <tbody>{ROWS}</tbody>
    </table>
    <table class='tot'>
      <tr><td class='k'>Taxable Value</td><td class='v'>&#8377;{TAXABLE}</td></tr>
      <tr><td class='k'>CGST @ {HALFRATE}%</td><td class='v'>&#8377;{CGST}</td></tr>
      <tr><td class='k'>SGST @ {HALFRATE}%</td><td class='v'>&#8377;{SGST}</td></tr>
      {EXTRAROWS}
      <tr><td class='k'>Shipping</td><td class='v'>{SHIP}</td></tr>
      <tr class='grand'><td>GRAND TOTAL</td><td class='v' style='color:#fff'>&#8377;{TOTAL}</td></tr>
    </table>
    <div class='words'><b>Amount in Words:</b> {WORDS}</div>
    <div class='cc'>
      <div>
        <div class='sect'>Terms &amp; Conditions</div>
        <div class='body'>&bull; Return/exchange request within 7 days of delivery.<br>&bull; Product must be unused, unwashed and with original tags.<br>&bull; Unboxing video required for wrong/damaged/missing item.<br>&bull; Refund is processed after quality check.<br>&bull; Colour may vary slightly due to screen and lighting.</div>
      </div>
      <div>
        <div class='sect'>Why Choose Us</div>
        <div class='body'>&#10003; Secure payment options<br>&#10003; Quality-checked products<br>&#10003; Transparent pricing &amp; GST invoice<br>&#10003; Easy returns<br>&#10003; Dedicated customer support</div>
      </div>
    </div>
    <div class='thanks'>
      <div class='ty'>Thank You for Shopping with Us!</div>
      <div class='links'>www.mahalaxmifashionhub.com &nbsp;|&nbsp; Instagram: @mahalaxmifashionhub &nbsp;|&nbsp; WhatsApp: +91 94294 29880</div>
      <div class='fine'>This is a computer-generated invoice and does not require a signature.<br>&copy; {YEAR} Mahalaxmi Fashion Hub &bull; Downloadable for 12 months from the order date.</div>
    </div>
    <div class='brandline'>Mahalaxmi Fashion Hub | Premium Tax Invoice</div>
  </div>
</body></html>";


    // Invoice prefix for the current Indian financial year, e.g. "M/26-27/".
    // The FY runs 1 April → 31 March, so the counter resets each 1 April.
    private static string InvoicePrefix()
    {
        // Use India time so the 1-April boundary is correct locally.
        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5.5)).DateTime;
        int startYear = now.Month >= 4 ? now.Year : now.Year - 1;
        var fy = $"{startYear % 100:00}-{(startYear + 1) % 100:00}";   // e.g. "26-27"
        return $"MFH/{fy}/";
    }

    // Builds the next sequential GST invoice number for the given FY prefix, e.g. "M/26-27/001".
    // MUST be called while holding the advisory lock (see UpdateStatus) so the read-max-then-assign
    // is race-free.
    private async Task<string> NextInvoiceNumberAsync(string prefix)
    {
        var existing = await _db.SiteOrders
            .Where(o => o.InvoiceNumber != null && o.InvoiceNumber.StartsWith(prefix))
            .Select(o => o.InvoiceNumber!)
            .ToListAsync();

        var maxSeq = existing
            .Select(s => int.TryParse(s.Substring(prefix.Length), out var n) ? n : 0)
            .DefaultIfEmpty(0)
            .Max();

        return $"{prefix}{maxSeq + 1:000}";
    }

    // PATCH /api/orders/{orderId}/cancel  (Customer cancel request, allowed within 12 hours)
    [HttpPatch("{orderId}/cancel")]
    [Authorize]
    public async Task<IActionResult> RequestCancel(string orderId)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        // SEC-4 IDOR: verify caller owns this order (admin bypasses)
        if (!User.HasSectionAccess("orders"))
        {
            var callerId = User.FindFirstValue("sub");
            var callerEmail = User.FindFirstValue("email");
            var orderCustomerId = GetJsonStr(ParseJson(order.CustomerJson), "id");
            var orderEmail = GetJsonStr(ParseJson(order.CustomerJson), "email");
            if (callerId != orderCustomerId &&
                !string.Equals(callerEmail, orderEmail, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        if (order.Status == "Cancel Requested")
            return Ok(new { success = true, order = MapOrder(order), message = "Cancel request already submitted." });

        if (!new[] { "Order Received", "Pending", "Pending confirmation" }.Contains(order.Status))
            return BadRequest(new { success = false, message = "This order can no longer be cancelled online." });

        var placedAt = order.PlacedAt ?? order.CreatedAt;
        if (DateTimeOffset.UtcNow - placedAt > TimeSpan.FromHours(12))
            return BadRequest(new { success = false, message = "Orders can be cancelled online only within 12 hours of placement." });

        order.RawJson = JsonSerializer.Serialize(new
        {
            previousStatusBeforeCancel = order.Status,
            cancelRequestedAt = DateTimeOffset.UtcNow
        }, _json);
        order.Status = "Cancel Requested";
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, order = MapOrder(order) });
    }

    // POST /api/orders/{orderId}/return  (Customer return request, allowed within 7 days of delivery)
    [HttpPost("{orderId}/return")]
    [Authorize]
    public async Task<IActionResult> RequestReturn(string orderId, [FromBody] ReturnRequest req)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        // SEC-4 IDOR: verify caller owns this order
        if (!User.HasSectionAccess("orders"))
        {
            var callerId = User.FindFirstValue("sub");
            var callerEmail = User.FindFirstValue("email");
            var orderCustomerId = GetJsonStr(ParseJson(order.CustomerJson), "id");
            var orderEmail = GetJsonStr(ParseJson(order.CustomerJson), "email");
            if (callerId != orderCustomerId &&
                !string.Equals(callerEmail, orderEmail, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        if (order.Status == "Return Requested")
            return Ok(new { success = true, order = MapOrder(order), message = "Return request already submitted." });

        if (order.Status != "Delivered")
            return BadRequest(new { success = false, message = "Only delivered orders can be returned." });

        // BUG-2: Use DeliveredAt if recorded, otherwise fall back to UpdatedAt
        var deliveredAt = order.DeliveredAt ?? order.UpdatedAt;
        if (DateTimeOffset.UtcNow - deliveredAt > TimeSpan.FromDays(7))
            return BadRequest(new { success = false, message = "The 7-day return window has expired." });

        order.RawJson = JsonSerializer.Serialize(new
        {
            returnRequestedAt = DateTimeOffset.UtcNow,
            returnIssue       = req.Issue?.Trim() ?? "",
            returnReason      = (req.Description ?? req.Reason)?.Trim() ?? "",
            returnInvoiceNo   = req.InvoiceNumber?.Trim() ?? order.InvoiceNumber ?? "",
            returnAwb         = req.Awb?.Trim() ?? order.Awb ?? "",
            returnPayment     = req.PaymentMethod?.Trim() ?? order.Method,
            returnCallback    = req.Callback?.Trim() ?? "",
            returnMedia       = new
            {
                openingVideo  = req.OpeningVideo?.Trim() ?? "",
                closingVideo  = req.ClosingVideo?.Trim() ?? "",
                openingPhotos = (req.OpeningPhotos ?? new List<string>()).Where(u => !string.IsNullOrWhiteSpace(u)).Take(4).ToList(),
                closingPhotos = (req.ClosingPhotos ?? new List<string>()).Where(u => !string.IsNullOrWhiteSpace(u)).Take(4).ToList()
            }
        }, _json);
        order.Status = "Return Requested";
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        // Repeat-return alert: if this customer now has 2+ orders in a return flow, flag possible abuse.
        try
        {
            var oc = ParseJson(order.CustomerJson);
            var custEmail = (GetJsonStr(oc, "email") ?? "").Trim().ToLowerInvariant();
            var custPhone = NormalizePhone(GetJsonStr(oc, "phone"));
            var returnStates = new[] { "Return Requested", "Return Transit", "Return" };
            var candidates = await _db.SiteOrders.Where(o => returnStates.Contains(o.Status)).ToListAsync();
            var count = candidates.Count(o =>
            {
                var c = ParseJson(o.CustomerJson);
                var e = (GetJsonStr(c, "email") ?? "").Trim().ToLowerInvariant();
                var p = NormalizePhone(GetJsonStr(c, "phone"));
                return (!string.IsNullOrEmpty(custEmail) && e == custEmail)
                    || (!string.IsNullOrEmpty(custPhone) && p == custPhone);
            });
            if (count >= 2)
            {
                var name = GetJsonStr(oc, "name") ?? "Customer";
                await _notify.NotifyAsync($"Repeat return alert - {name} ({count})",
                    Services.AdminNotifier.Wrap("Repeat Return Alert", $@"
                        <p><strong>{System.Net.WebUtility.HtmlEncode(name)}</strong> has now made/requested <strong>{count} returns</strong>.</p>
                        <p><strong>Contact:</strong> {System.Net.WebUtility.HtmlEncode(custEmail)} &middot; {System.Net.WebUtility.HtmlEncode(GetJsonStr(oc, "phone") ?? "")}</p>
                        <p><strong>Latest order:</strong> {order.OrderId}</p>
                        <p>Please review this customer for possible return abuse.</p>"));
            }
        }
        catch { /* alert is best-effort */ }

        return Ok(new { success = true, order = MapOrder(order) });
    }

    // POST /api/orders/{orderId}/return-media  — upload ONE return photo/video (called per file)
    // kind ∈ { openingVideo, closingVideo, openingPhoto, closingPhoto }
    [HttpPost("{orderId}/return-media")]
    [Authorize]
    [RequestSizeLimit(85_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 85_000_000)]
    public async Task<IActionResult> UploadReturnMedia(string orderId, [FromForm] IFormFile? file, [FromForm] string? kind)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        // SEC-4 IDOR: caller must own this order (admin bypasses)
        if (!User.HasSectionAccess("orders"))
        {
            var callerId = User.FindFirstValue("sub");
            var callerEmail = User.FindFirstValue("email");
            var oc = ParseJson(order.CustomerJson);
            if (callerId != GetJsonStr(oc, "id") &&
                !string.Equals(callerEmail, GetJsonStr(oc, "email"), StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        if (file is null || file.Length == 0)
            return BadRequest(new { success = false, message = "No file received." });

        var kinds = new[] { "openingVideo", "closingVideo", "openingPhoto", "closingPhoto" };
        if (string.IsNullOrEmpty(kind) || !kinds.Contains(kind))
            return BadRequest(new { success = false, message = "Invalid media kind." });

        bool isVideo = kind.EndsWith("Video");
        var ct = file.ContentType ?? "";
        if (isVideo && !ct.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "Expected a video file." });
        if (!isVideo && !ct.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "Expected an image file." });

        long maxBytes = isVideo ? 80L * 1024 * 1024 : 8L * 1024 * 1024;
        if (file.Length > maxBytes)
            return BadRequest(new { success = false, message = $"File too large (max {(isVideo ? "80 MB" : "8 MB")})." });

        var ext = Path.GetExtension(file.FileName ?? "");
        ext = new string(ext.Where(c => char.IsLetterOrDigit(c) || c == '.').ToArray()).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(ext) || ext.Length > 6) ext = isVideo ? ".mp4" : ".jpg";

        var safeOrder = CleanOrderId(orderId);
        var dir = Path.Combine(ReturnsRoot(), safeOrder);
        Directory.CreateDirectory(dir);
        var name = $"{kind}_{Guid.NewGuid():N}{ext}";
        var savedPath = Path.Combine(dir, name);
        await using (var fs = System.IO.File.Create(savedPath))
            await file.CopyToAsync(fs);

        // Videos: re-encode to a compact 720p H.264 mp4 with ffmpeg. Falls back to the
        // original file if ffmpeg is unavailable or fails, so uploads never break.
        if (isVideo)
        {
            var (compressedName, compressedPath) = await TryCompressVideoAsync(dir, kind, savedPath);
            if (compressedName is not null)
            {
                if (!string.Equals(compressedPath, savedPath, StringComparison.Ordinal))
                    try { System.IO.File.Delete(savedPath); } catch { /* keep going */ }
                name = compressedName;
            }
        }

        return Ok(new { success = true, url = $"/api/orders/return-media/{safeOrder}/{name}" });
    }

    // Re-encode a video to 720p H.264 mp4 (CRF 28) so stored/return videos stay small.
    // Returns the new file name + path on success, or (null, original) if ffmpeg isn't
    // available or the encode fails — caller then keeps the untouched original.
    private static async Task<(string? name, string path)> TryCompressVideoAsync(string dir, string kind, string sourcePath)
    {
        try
        {
            var outName = $"{kind}_{Guid.NewGuid():N}.mp4";
            var outPath = Path.Combine(dir, outName);
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "ffmpeg",
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            // scale to max 1280px wide (keep aspect, even dims), fast H.264, AAC audio, web-friendly.
            foreach (var a in new[]
            {
                "-y", "-i", sourcePath,
                "-vf", "scale='min(1280,iw)':-2",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
                "-c:a", "aac", "-b:a", "96k",
                "-movflags", "+faststart",
                outPath
            }) psi.ArgumentList.Add(a);

            using var proc = System.Diagnostics.Process.Start(psi);
            if (proc is null) return (null, sourcePath);

            using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(4));
            try { await proc.WaitForExitAsync(cts.Token); }
            catch (OperationCanceledException) { try { proc.Kill(true); } catch { } return (null, sourcePath); }

            if (proc.ExitCode == 0 && System.IO.File.Exists(outPath) && new FileInfo(outPath).Length > 0)
                return (outName, outPath);

            try { if (System.IO.File.Exists(outPath)) System.IO.File.Delete(outPath); } catch { }
            return (null, sourcePath);
        }
        catch
        {
            // ffmpeg missing / not on PATH / any failure → keep the original upload.
            return (null, sourcePath);
        }
    }

    // GET /api/orders/return-media/{orderId}/{file}  — stream a stored return photo/video.
    // Anonymous read: filenames are unguessable GUIDs (act as capability tokens).
    [HttpGet("return-media/{orderId}/{file}")]
    [AllowAnonymous]
    public IActionResult GetReturnMedia(string orderId, string file)
    {
        var safeOrder = CleanOrderId(orderId);
        var safeFile = new string((file ?? "").Where(c => char.IsLetterOrDigit(c) || c == '_' || c == '.' || c == '-').ToArray());
        if (string.IsNullOrEmpty(safeFile) || safeFile.Contains(".."))
            return NotFound();

        var full = Path.Combine(ReturnsRoot(), safeOrder, safeFile);
        if (!System.IO.File.Exists(full))
            return NotFound();

        var mime = Path.GetExtension(full).ToLowerInvariant() switch
        {
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            ".mov" => "video/quicktime",
            ".ogg" or ".ogv" => "video/ogg",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "application/octet-stream"
        };
        return File(System.IO.File.OpenRead(full), mime, enableRangeProcessing: true);
    }

    // POST /api/orders/{orderId}/return-decision  (Admin: approve or reject a return)
    //   approve → return media is deleted immediately.
    //   reject  → reason required; media kept as evidence for 30 days, then auto-purged.
    [HttpPost("{orderId}/return-decision")]
    [Authorize]
    [RequirePerm("orders")]
    public async Task<IActionResult> ReturnDecision(string orderId, [FromBody] ReturnDecisionRequest req)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        var decision = (req.Decision ?? "").Trim().ToLowerInvariant();
        if (decision != "approve" && decision != "reject")
            return BadRequest(new { success = false, message = "Decision must be 'approve' or 'reject'." });

        var reason = (req.Reason ?? "").Trim();
        if (decision == "reject" && string.IsNullOrWhiteSpace(reason))
            return BadRequest(new { success = false, message = "A reason is required to reject a return." });

        // Merge onto existing raw_json so original return details are preserved.
        var root = (JsonNode.Parse(string.IsNullOrWhiteSpace(order.RawJson) ? "{}" : order.RawJson) as JsonObject)
                   ?? new JsonObject();
        var now = DateTimeOffset.UtcNow;
        var actor = User.FindFirstValue("email") ?? User.FindFirstValue("sub") ?? "admin";

        if (decision == "approve")
        {
            // Return accepted → media no longer needed, delete now.
            DeleteReturnMediaDir(orderId);
            root["returnMedia"] = new JsonObject
            {
                ["openingVideo"]  = "",
                ["closingVideo"]  = "",
                ["openingPhotos"] = new JsonArray(),
                ["closingPhotos"] = new JsonArray(),
            };
            root["returnDecision"]     = "approved";
            root["returnDecisionAt"]   = now.ToString("o");
            root["returnRejectReason"] = "";
            root["returnMediaDeleted"] = true;
            root.Remove("returnMediaPurgeAt");
            // Approved → accepted, item on its way back. Leaves "Return Requested".
            order.Status = "Return Transit";
        }
        else // reject
        {
            root["returnDecision"]     = "rejected";
            root["returnDecisionAt"]   = now.ToString("o");
            root["returnRejectReason"] = reason;
            root["returnMediaPurgeAt"] = now.AddDays(30).ToString("o");
            root["returnMediaDeleted"] = false;
            // Rejected → return denied, order stays delivered. Leaves the Returns queue.
            order.Status = "Delivered";
        }
        root["returnDecisionBy"] = actor;

        order.RawJson = root.ToJsonString();
        order.UpdatedAt = now;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, order = MapOrder(order) });
    }

    // POST /api/orders/{orderId}/return-awb  (Admin/Staff)
    //   mode = "manual" → store the AWB the admin pasted from their courier panel.
    //   mode = "auto"   → generate a Delhivery REVERSE pickup from the customer's address.
    // Either way the order moves to "Return Transit".
    [HttpPost("{orderId}/return-awb")]
    [Authorize]
    [RequirePerm("orders")]
    public async Task<IActionResult> AssignReturnAwb(string orderId, [FromBody] ReturnAwbRequest req)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });

        var mode = (req.Mode ?? "manual").Trim().ToLowerInvariant();
        string awb;
        string courier;

        if (mode == "auto")
        {
            var ship = ParseJson(order.ShippingJson);
            var cust = ParseJson(order.CustomerJson);
            var from = new Services.DelhiveryService.PickupAddress(
                Name:    GetJsonStr(ship, "name") ?? GetJsonStr(cust, "name") ?? "",
                Address: GetJsonStr(ship, "address") ?? "",
                Pincode: GetJsonStr(ship, "pincode") ?? "",
                City:    GetJsonStr(ship, "city") ?? "",
                State:   GetJsonStr(ship, "state") ?? "",
                Phone:   GetJsonStr(cust, "phone") ?? "");

            var result = await _delhivery.CreateReversePickupAsync(order.OrderId, from, "Return pickup");
            if (!result.Success || string.IsNullOrWhiteSpace(result.Awb))
                return BadRequest(new { success = false, message = result.Error ?? "Delhivery reverse pickup failed." });

            awb = result.Awb!;
            courier = "Delhivery";
        }
        else
        {
            awb = new string((req.Awb ?? "").Where(char.IsLetterOrDigit).ToArray());
            if (string.IsNullOrWhiteSpace(awb))
                return BadRequest(new { success = false, message = "Enter a return AWB / tracking number." });
            courier = string.IsNullOrWhiteSpace(req.Courier) ? "Manual" : req.Courier!.Trim();
        }

        order.Awb = awb;
        order.Courier = courier;
        order.Status = "Return Transit";
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, order = MapOrder(order), awb, courier });
    }

    // GET /api/orders/pincode/{pin}  (Public)
    // Delhivery serviceability + COD availability + honest delivery-day estimate for a
    // pincode (origin: Balotra 344022). Result is safe to cache — serviceability rarely changes.
    private static readonly Dictionary<string, (bool known, bool ok, bool cod, string? city, string? state, DateTimeOffset at)> _pinCache = new();
    [HttpGet("pincode/{pin}")]
    [AllowAnonymous]
    public async Task<IActionResult> CheckPincode(string pin)
    {
        var p = new string((pin ?? "").Where(char.IsDigit).ToArray());
        if (p.Length != 6)
            return BadRequest(new { success = false, message = "Enter a valid 6-digit pincode." });

        (bool known, bool ok, bool cod, string? city, string? state) r;
        lock (_pinCache)
        {
            if (_pinCache.TryGetValue(p, out var hit) && DateTimeOffset.UtcNow - hit.at < TimeSpan.FromHours(12))
                r = (hit.known, hit.ok, hit.cod, hit.city, hit.state);
            else r = default;
        }
        if (r == default)
        {
            var chk = await _delhivery.CheckPincodeAsync(p);
            r = (chk.Known, chk.Serviceable, chk.Cod, chk.City, chk.State);
            lock (_pinCache)
            {
                if (_pinCache.Count > 5000) _pinCache.Clear();
                _pinCache[p] = (r.known, r.ok, r.cod, r.city, r.state, DateTimeOffset.UtcNow);
            }
        }

        // Honest ETA heuristic from Balotra (Rajasthan) origin.
        int minDays, maxDays;
        var st = (r.state ?? "").ToUpperInvariant();
        if (p.StartsWith("344")) (minDays, maxDays) = (1, 2);
        else if (st == "RJ" || p.StartsWith("3")) (minDays, maxDays) = (2, 4);
        else if (st is "GJ" or "DL" or "HR" or "MP" or "UP" or "PB" or "CH" or "UK" or "MH") (minDays, maxDays) = (3, 5);
        else if (st is "AS" or "AR" or "MN" or "ML" or "MZ" or "NL" or "TR" or "SK" or "JK" or "LA" or "AN") (minDays, maxDays) = (5, 9);
        else (minDays, maxDays) = (4, 7);

        // Store-level COD block: if the admin has switched COD off for this pincode (fraud/returns
        // control), report COD as unavailable so the checkout hides the COD option automatically.
        var storeBlocked = await GetCodBlockedPincodesAsync();
        bool codAllowed = r.cod && !storeBlocked.Contains(p);

        return Ok(new
        {
            success = true,
            known = r.known,
            serviceable = r.ok,
            cod = codAllowed,
            city = r.city,
            state = r.state,
            etaMinDays = minDays,
            etaMaxDays = maxDays,
        });
    }

    // ── FRAUD / RISK ANALYTICS ───────────────────────────────────────────────────
    // GET /api/orders/risk/summary  (Admin) — pincode-wise order/cancel/return analysis
    // plus the list of high-risk customers (the "red zone") and the current COD-blocked pins.
    [HttpGet("risk/summary")]
    [Authorize]
    public async Task<IActionResult> RiskSummary()
    {
        if (!User.HasSectionAccess("orders", "reports", "reconcile"))
            return Forbid();

        var all = await _db.SiteOrders.AsNoTracking().ToListAsync();
        var blocked = await GetCodBlockedPincodesAsync();

        var returnStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "Return Requested", "Return Transit", "Return" };

        // Per-pincode aggregation.
        var pinAgg = new Dictionary<string, (int total, int cod, int cancelled, int returned, int delivered, string? city, string? state)>();
        // Per-customer cancellation tally for the "red zone".
        var custAgg = new Dictionary<string, (string? name, string? phone, int total, int cancelled, int returned)>();

        foreach (var o in all)
        {
            var sj  = ParseJson(o.ShippingJson);
            var cj  = ParseJson(o.CustomerJson);
            var pin = new string((GetJsonStr(sj, "pincode") ?? "").Where(char.IsDigit).ToArray());
            var status = o.Status ?? "";
            bool isCancelled = string.Equals(status, "Cancelled", StringComparison.OrdinalIgnoreCase);
            bool isReturned  = returnStatuses.Contains(status);
            bool isDelivered = string.Equals(status, "Delivered", StringComparison.OrdinalIgnoreCase);
            bool isCod = string.Equals(o.Method, "cod", StringComparison.OrdinalIgnoreCase);

            if (pin.Length == 6)
            {
                pinAgg.TryGetValue(pin, out var a);
                a.total++;
                if (isCod) a.cod++;
                if (isCancelled) a.cancelled++;
                if (isReturned) a.returned++;
                if (isDelivered) a.delivered++;
                a.city ??= GetJsonStr(sj, "city");
                a.state ??= GetJsonStr(sj, "state");
                pinAgg[pin] = a;
            }

            var cid = GetJsonStr(cj, "id");
            if (!string.IsNullOrWhiteSpace(cid) && cid != "0")
            {
                custAgg.TryGetValue(cid, out var c);
                c.name  = !string.IsNullOrWhiteSpace(GetJsonStr(cj, "name")) ? GetJsonStr(cj, "name")! : c.name;
                c.phone = !string.IsNullOrWhiteSpace(GetJsonStr(cj, "phone")) ? GetJsonStr(cj, "phone")! : c.phone;
                c.total++;
                if (isCancelled) c.cancelled++;
                if (isReturned) c.returned++;
                custAgg[cid] = c;
            }
        }

        var pincodes = pinAgg.Select(kv => new
        {
            pincode   = kv.Key,
            city      = kv.Value.city,
            state     = kv.Value.state,
            total     = kv.Value.total,
            cod       = kv.Value.cod,
            cancelled = kv.Value.cancelled,
            returned  = kv.Value.returned,
            delivered = kv.Value.delivered,
            cancelRate = kv.Value.total > 0 ? Math.Round(100.0 * kv.Value.cancelled / kv.Value.total, 1) : 0,
            returnRate = kv.Value.total > 0 ? Math.Round(100.0 * kv.Value.returned  / kv.Value.total, 1) : 0,
            // "Risky" = enough orders to judge AND a high combined cancel+return rate.
            risky = kv.Value.total >= 3 && (kv.Value.cancelled + kv.Value.returned) * 100.0 / kv.Value.total >= 40.0,
            codBlocked = blocked.Contains(kv.Key),
        })
        .OrderByDescending(p => p.cancelled + p.returned)
        .ThenByDescending(p => p.total)
        .ToList();

        var riskyCustomers = custAgg
            .Where(kv => kv.Value.cancelled > HighRiskCancelThreshold)
            .Select(kv => new
            {
                customerId = kv.Key,
                name       = kv.Value.name,
                phone      = kv.Value.phone,
                total      = kv.Value.total,
                cancelled  = kv.Value.cancelled,
                returned   = kv.Value.returned,
            })
            .OrderByDescending(c => c.cancelled)
            .ToList();

        return Ok(new
        {
            success = true,
            highRiskThreshold = HighRiskCancelThreshold,
            codBlocked = blocked.OrderBy(x => x).ToList(),
            pincodes,
            riskyCustomers,
        });
    }

    // POST /api/orders/risk/cod-block  (Admin) — turn COD on/off for one pincode.
    [HttpPost("risk/cod-block")]
    [Authorize]
    public async Task<IActionResult> SetCodBlock([FromBody] CodBlockRequest req)
    {
        if (!User.HasSectionAccess("orders", "reports"))
            return Forbid();

        var pin = new string((req.Pincode ?? "").Where(char.IsDigit).ToArray());
        if (pin.Length != 6)
            return BadRequest(new { success = false, message = "Enter a valid 6-digit pincode." });

        var set = await GetCodBlockedPincodesAsync();
        if (req.Blocked) set.Add(pin); else set.Remove(pin);
        var value = string.Join(",", set.OrderBy(x => x));

        var s = await _db.SiteSettings.FirstOrDefaultAsync(x => x.Key == CodBlockedKey);
        if (s is null) _db.SiteSettings.Add(new SiteSetting { Key = CodBlockedKey, Value = value });
        else { s.Value = value; s.UpdatedAt = DateTimeOffset.UtcNow; }
        await _db.SaveChangesAsync();
        _cache.Remove(PublicSettingsCacheKey); // so the storefront sees the change promptly

        return Ok(new { success = true, codBlocked = set.OrderBy(x => x).ToList() });
    }

    public record CodBlockRequest(string Pincode, bool Blocked);

    // GET /api/orders/live-track/{awb}  (Public)
    // Live Delhivery tracking timeline for the customer tracking page — shipment-safe
    // fields only (status, expected date, scans), no customer PII. Also forward-syncs
    // the site order status instantly so the two never disagree.
    [HttpGet("live-track/{awb}")]
    [AllowAnonymous]
    public async Task<IActionResult> LiveTrack(string awb)
    {
        var safe = new string((awb ?? "").Where(char.IsLetterOrDigit).ToArray());
        if (safe.Length < 8)
            return BadRequest(new { success = false, message = "Invalid AWB." });

        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.Awb == safe);
        if (order is null)
            return NotFound(new { success = false, message = "No shipment found with this AWB." });

        var detail = await _delhivery.TrackDetailAsync(safe);
        if (!detail.Success)
            return Ok(new { success = true, live = false, orderId = order.OrderId, siteStatus = order.Status });

        // Instant forward-only sync (same mapping as the background sync service).
        var s = (detail.Status ?? "").ToLowerInvariant();
        var changed = false;
        if (s.Contains("delivered") && !s.Contains("undelivered") && !s.Contains("rto"))
        {
            if (order.Status != "Delivered")
            {
                order.Status = "Delivered";
                order.DeliveredAt ??= DateTimeOffset.UtcNow;
                changed = true;
            }
        }
        else if ((s.Contains("picked") || s.Contains("transit") || s.Contains("dispatched") || s.Contains("reached") || s.Contains("out for delivery"))
                 && order.Status is "Order Packed" or "Ready for Shipping" or "Shipped")
        {
            order.Status = "Transit";
            changed = true;
        }
        if (changed)
        {
            order.UpdatedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync();
        }

        return Ok(new
        {
            success = true,
            live = true,
            orderId = order.OrderId,
            siteStatus = order.Status,
            courierStatus = detail.Status,
            expectedDate = detail.ExpectedDate,
            scans = detail.Scans.Select(x => new { time = x.Time, location = x.Location, remark = x.Remark }),
        });
    }

    // POST /api/orders/{orderId}/generate-awb  (Admin/Staff)
    // Auto-creates a FORWARD Delhivery shipment for the order and stores the generated AWB.
    // Falls back with a clear message if Delhivery isn't configured — admin can then enter manually.
    [HttpPost("{orderId}/generate-awb")]
    [Authorize]
    [RequirePerm("orders")]
    public async Task<IActionResult> GenerateAwb(string orderId)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order is null)
            return NotFound(new { success = false, message = "Order not found." });
        if (!string.IsNullOrWhiteSpace(order.Awb))
            return Ok(new { success = true, awb = order.Awb, order = MapOrder(order), message = "This order already has an AWB." });

        var ship = ParseJson(order.ShippingJson);
        var cust = ParseJson(order.CustomerJson);
        var to = new Services.DelhiveryService.ShipTo(
            Name:    GetJsonStr(ship, "name") ?? GetJsonStr(cust, "name") ?? "",
            Address: GetJsonStr(ship, "address") ?? "",
            Pincode: GetJsonStr(ship, "pincode") ?? "",
            City:    GetJsonStr(ship, "city") ?? "",
            State:   GetJsonStr(ship, "state") ?? "",
            Phone:   GetJsonStr(cust, "phone") ?? "");

        var isCod = string.Equals(order.Method, "cod", StringComparison.OrdinalIgnoreCase);
        // COD cash to collect = order value minus any amount already paid from the wallet.
        var codCollect = Math.Max(0m, order.Total - order.WalletUsed);
        var result = await _delhivery.CreateForwardShipmentAsync(order.OrderId, to, isCod ? codCollect : 0m, "Fashion item");
        if (!result.Success || string.IsNullOrWhiteSpace(result.Awb))
            return BadRequest(new { success = false, message = result.Error ?? "Delhivery AWB generation failed." });

        order.Awb = result.Awb;
        order.Courier = "Delhivery";
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        // AUTO PICKUP: din ke pehle AWB ke saath Delhivery pickup bhi khud schedule ho
        // jata hai (ek hi baar per date) — Delhivery One pe "Create New Pickup" click
        // karne ki zaroorat nahi. Fail ho to AWB phir bhi ban chuka hai; message dikha do.
        string? pickupMessage = null;
        try
        {
            var pickup = await _delhivery.AutoRequestPickupAsync();
            pickupMessage = pickup.Message;
        }
        catch { /* pickup best-effort — AWB result ko kabhi na roke */ }

        return Ok(new { success = true, awb = result.Awb, order = MapOrder(order), pickupMessage });
    }

    // Best-effort delete of an order's stored return media directory (instance helper).
    private void DeleteReturnMediaDir(string orderId) => PurgeReturnMediaDir(ReturnsRoot(), orderId);

    // Static purge used by both the controller and the background cleanup service.
    public static void PurgeReturnMediaDir(string returnsRoot, string orderId)
    {
        var safe = CleanOrderId(orderId);
        var dir = Path.Combine(returnsRoot, safe);
        try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); } catch { /* best effort */ }
    }

    private static JsonElement ParseJson(string? raw)
    {
        if (string.IsNullOrEmpty(raw)) return new JsonElement();
        try { return JsonSerializer.Deserialize<JsonElement>(raw); }
        catch { return new JsonElement(); }
    }

    private static string? GetJsonStr(JsonElement el, string key)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(key, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _ => v.ToString(),   // number/bool stored where a string was expected — don't throw
        };
    }

    private static bool GetJsonBool(JsonElement el, string key) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v)
            && v.ValueKind == JsonValueKind.True;

    private static JsonElement GetJsonObj(JsonElement el, string key) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v) ? v : default;

    private static List<string> GetJsonArr(JsonElement el, string key) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Array
            ? v.EnumerateArray().Where(e => e.ValueKind == JsonValueKind.String).Select(e => e.GetString()!).ToList()
            : new List<string>();

    private static string CleanOrderId(string? raw)
    {
        var id = new string((raw ?? "").Where(c => char.IsLetterOrDigit(c) || c == '_' || c == '-').ToArray());
        return string.IsNullOrEmpty(id) ? $"MFH{DateTime.UtcNow:yyMMddHHmmssfff}" : id;
    }

    private static OrderDto MapOrder(SiteOrder o)
    {
        // Defensive: one order with malformed/legacy JSON must NEVER crash the whole orders
        // list. ParseJson + try/catch degrade gracefully instead of throwing a 500.
        var customerJson = ParseJson(o.CustomerJson);
        var shippingJson = ParseJson(o.ShippingJson);
        var rawJson = ParseJson(o.RawJson);
        List<CartLineDto> cartLines;
        try
        {
            cartLines = string.IsNullOrEmpty(o.CartJson)
                ? new List<CartLineDto>()
                : JsonSerializer.Deserialize<List<CartLineDto>>(o.CartJson, _json) ?? new List<CartLineDto>();
        }
        catch { cartLines = new List<CartLineDto>(); }

        // Guest / webhook-recovered orders keep the buyer name+phone in the shipping JSON;
        // fall back to it when the customer JSON has none (so admin never shows a blank name).
        var custName = GetJsonStr(customerJson, "name");
        if (string.IsNullOrWhiteSpace(custName)) custName = GetJsonStr(shippingJson, "name");
        var custPhone = GetJsonStr(customerJson, "phone");
        if (string.IsNullOrWhiteSpace(custPhone)) custPhone = GetJsonStr(shippingJson, "phone");

        return new OrderDto(
            o.OrderId,
            o.PaymentId,
            o.Method,
            o.Status,
            cartLines,
            o.Subtotal,
            o.ShippingCost,
            o.CodFee,
            o.Total,
            o.Awb,
            GetJsonStr(customerJson, "id"),
            custName,
            GetJsonStr(customerJson, "email"),
            custPhone,
            GetJsonStr(shippingJson, "name"),
            GetJsonStr(shippingJson, "address"),
            GetJsonStr(shippingJson, "city"),
            GetJsonStr(shippingJson, "pincode"),
            GetJsonStr(shippingJson, "state"),
            o.PlacedAt,
            // BUG-2: Use recorded DeliveredAt; fall back to UpdatedAt for legacy orders
            o.DeliveredAt ?? (string.Equals(o.Status, "Delivered", StringComparison.OrdinalIgnoreCase) ? o.UpdatedAt : null),
            o.CreatedAt,
            o.UpdatedAt,
            o.PanNumber,
            o.PanName,
            InvoiceNumber: o.InvoiceNumber,
            Courier: o.Courier,
            ReturnIssue: GetJsonStr(rawJson, "returnIssue"),
            ReturnReason: GetJsonStr(rawJson, "returnReason"),
            ReturnCallback: GetJsonStr(rawJson, "returnCallback"),
            ReturnOpeningVideo: GetJsonStr(GetJsonObj(rawJson, "returnMedia"), "openingVideo"),
            ReturnClosingVideo: GetJsonStr(GetJsonObj(rawJson, "returnMedia"), "closingVideo"),
            ReturnOpeningPhotos: GetJsonArr(GetJsonObj(rawJson, "returnMedia"), "openingPhotos"),
            ReturnClosingPhotos: GetJsonArr(GetJsonObj(rawJson, "returnMedia"), "closingPhotos"),
            ReturnDecision: GetJsonStr(rawJson, "returnDecision"),
            ReturnDecisionAt: GetJsonStr(rawJson, "returnDecisionAt"),
            ReturnRejectReason: GetJsonStr(rawJson, "returnRejectReason"),
            ReturnMediaPurgeAt: GetJsonStr(rawJson, "returnMediaPurgeAt"),
            ReturnMediaDeleted: GetJsonBool(rawJson, "returnMediaDeleted"),
            WalletUsed: o.WalletUsed
        );
    }
}

public record ReturnRequest(
    string? Reason,
    string? Issue = null,
    string? Description = null,
    string? InvoiceNumber = null,
    string? Awb = null,
    string? PaymentMethod = null,
    string? Callback = null,
    string? OpeningVideo = null,
    string? ClosingVideo = null,
    List<string>? OpeningPhotos = null,
    List<string>? ClosingPhotos = null
);

public record ReturnDecisionRequest(
    string? Decision,      // "approve" | "reject"
    string? Reason = null  // required when rejecting; shown to the customer
);

public record ReturnAwbRequest(
    string? Mode,          // "manual" | "auto"
    string? Awb = null,    // required for manual
    string? Courier = null
);
