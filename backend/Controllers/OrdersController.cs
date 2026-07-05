using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using MahalaxmiApi.Data;
using MahalaxmiApi.DTOs;
using MahalaxmiApi.Models;

namespace MahalaxmiApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions _json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly string[] AllowedStatuses =
    [
        "Order Received", "Pending", "Pending confirmation", "Paid", "On Hold",
        "Order Packed", "Ready for Shipping",
        "Shipped", "Transit", "Delivered", "Return Requested", "Return Transit",
        "Return", "Cancel Requested", "Cancelled"
    ];

    private readonly IWebHostEnvironment _env;

    public OrdersController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
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
        bool isAdmin = User.HasClaim("role", "admin");

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
    [HttpGet("{orderId}")]
    public async Task<IActionResult> GetById(string orderId)
    {
        var order = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId || o.Awb == orderId);
        if (order is null) return NotFound(new { success = false, message = "Order not found." });
        return Ok(new { success = true, order = MapOrder(order) });
    }

    // POST /api/orders  (Place order — public)
    [HttpPost]
    public async Task<IActionResult> PlaceOrder([FromBody] PlaceOrderRequest req)
    {
        var orderId = CleanOrderId(req.Id);
        var method = req.Method.ToLower().Trim();
        var status = !string.IsNullOrWhiteSpace(req.Status)
            ? req.Status
            : "Pending";

        // BUG-6: Prefer JWT sub claim over client-supplied customerId — must happen BEFORE building customerJson
        var jwtCustomerId = User.FindFirstValue("sub");
        if (!string.IsNullOrEmpty(jwtCustomerId) && jwtCustomerId != "0")
            req = req with { CustomerId = jwtCustomerId };

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

        var existing = await _db.SiteOrders.FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (existing is not null)
        {
            // CQ-5: Never re-open a finalized order
            if (existing.Status is "Paid" or "Delivered" or "Cancelled")
                return Conflict(new { success = false, message = $"Order is already {existing.Status} and cannot be modified." });

            existing.Method = method;
            existing.Status = status;
            existing.PaymentId = req.PaymentId;
            existing.Subtotal = req.Subtotal;
            existing.ShippingCost = req.ShippingCost;
            existing.CodFee = req.CodFee;
            existing.Total = req.Total;
            existing.CartJson = cart;
            existing.CustomerJson = customerJson;
            existing.ShippingJson = shippingJson;
            existing.PlacedAt = req.PlacedAt ?? DateTimeOffset.UtcNow;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            _db.SiteOrders.Add(new SiteOrder
            {
                OrderId = orderId,
                Method = method,
                Status = status,
                PaymentId = req.PaymentId,
                Subtotal = req.Subtotal,
                ShippingCost = req.ShippingCost,
                CodFee = req.CodFee,
                Total = req.Total,
                CartJson = cart,
                CustomerJson = customerJson,
                ShippingJson = shippingJson,
                PlacedAt = req.PlacedAt ?? DateTimeOffset.UtcNow,
                // MISS-6: Store PAN details
                PanNumber = req.PanNumber?.Trim().ToUpper(),
                PanName = req.PanName?.Trim(),
                // Coupon
                CouponCode = string.IsNullOrWhiteSpace(req.CouponCode) ? null : req.CouponCode.Trim().ToUpper(),
                DiscountAmount = req.DiscountAmount,
            });
            // Increment coupon used_count
            if (!string.IsNullOrWhiteSpace(req.CouponCode))
            {
                var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Code.ToLower() == req.CouponCode.ToLower());
                if (coupon is not null)
                {
                    coupon.UsedCount++;

                    // A birthday/anniversary coupon "uses up" that offer → lock the customer's date.
                    if (coupon.Occasion is "birthday" or "anniversary"
                        && int.TryParse(req.CustomerId, out var cid) && cid > 0)
                    {
                        var buyer = await _db.Customers.FindAsync(cid);
                        if (buyer is not null)
                        {
                            if (coupon.Occasion == "birthday") buyer.BirthdayOfferUsed = true;
                            else buyer.AnniversaryOfferUsed = true;
                            buyer.UpdatedAt = DateTimeOffset.UtcNow;
                        }
                    }
                }
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true, orderId });
    }

    // PATCH /api/orders/status  (Admin only)
    [HttpPatch("status")]
    [Authorize(Policy = "AdminOrStaff")]
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

        order.Status = req.Status;
        if (req.Awb is not null)
            order.Awb = new string(req.Awb.Where(char.IsLetterOrDigit).ToArray());
        if (!string.IsNullOrWhiteSpace(req.Courier))
            order.Courier = req.Courier.Trim();
        // BUG-2: Record exact delivery time for accurate return window calculation
        if (string.Equals(req.Status, "Delivered", StringComparison.OrdinalIgnoreCase) && order.DeliveredAt is null)
            order.DeliveredAt = DateTimeOffset.UtcNow;

        // Assign a GST invoice number once the order is confirmed for shipping — at
        // "Ready for Shipping" or any later stage — if it doesn't already have one.
        var invoiceStatuses = new[] { "Ready for Shipping", "Shipped", "Transit", "Delivered" };
        if (invoiceStatuses.Contains(req.Status, StringComparer.OrdinalIgnoreCase)
            && string.IsNullOrEmpty(order.InvoiceNumber))
        {
            order.InvoiceNumber = await NextInvoiceNumberAsync();
        }

        order.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { success = true, order = MapOrder(order) });
    }

    // Builds the next sequential GST invoice number, e.g. "M/26-27/001".
    // The financial year runs 1 April → 31 March, so the counter resets each 1 April
    // (an invoice generated on/after 01-04-2027 becomes M/27-28/001).
    private async Task<string> NextInvoiceNumberAsync()
    {
        // Use India time so the 1-April boundary is correct locally.
        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5.5)).DateTime;
        int startYear = now.Month >= 4 ? now.Year : now.Year - 1;
        var fy = $"{startYear % 100:00}-{(startYear + 1) % 100:00}";   // e.g. "26-27"
        var prefix = $"M/{fy}/";

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
        if (!User.HasClaim("role", "admin"))
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
        if (!User.HasClaim("role", "admin"))
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
        if (!User.HasClaim("role", "admin"))
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
    [Authorize(Policy = "AdminOnly")]
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
        }
        else // reject
        {
            root["returnDecision"]     = "rejected";
            root["returnDecisionAt"]   = now.ToString("o");
            root["returnRejectReason"] = reason;
            root["returnMediaPurgeAt"] = now.AddDays(30).ToString("o");
            root["returnMediaDeleted"] = false;
        }
        root["returnDecisionBy"] = actor;

        order.RawJson = root.ToJsonString();
        order.UpdatedAt = now;
        await _db.SaveChangesAsync();

        return Ok(new { success = true, order = MapOrder(order) });
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

    private static string? GetJsonStr(JsonElement el, string key) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v)
            ? v.GetString() : null;

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
        var customerJson = string.IsNullOrEmpty(o.CustomerJson)
            ? new JsonElement()
            : JsonSerializer.Deserialize<JsonElement>(o.CustomerJson);
        var shippingJson = string.IsNullOrEmpty(o.ShippingJson)
            ? new JsonElement()
            : JsonSerializer.Deserialize<JsonElement>(o.ShippingJson);
        var rawJson = ParseJson(o.RawJson);
        var cartLines = string.IsNullOrEmpty(o.CartJson)
            ? new List<CartLineDto>()
            : JsonSerializer.Deserialize<List<CartLineDto>>(o.CartJson, _json) ?? [];

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
            GetJsonStr(customerJson, "name"),
            GetJsonStr(customerJson, "email"),
            GetJsonStr(customerJson, "phone"),
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
            ReturnMediaDeleted: GetJsonBool(rawJson, "returnMediaDeleted")
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
