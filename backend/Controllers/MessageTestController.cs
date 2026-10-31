using MahalaxmiApi.Authorization;
using MahalaxmiApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MahalaxmiApi.Controllers;

/// <summary>
/// Does each of the seven order templates actually fill its variables in?
///
/// There is no way to answer that by reading code, and no way to answer it
/// from MSG91 either. A flow's variables are whatever names were typed into
/// it in the panel - the help pages write them as ##VariableName## - and MSG91
/// publishes no endpoint that reports them back. Worse, a key that does not
/// match is not an error: the message is accepted, sent, and delivered with
/// that variable blank. HTTP 200, body says success, our log says accepted,
/// and the only place the fault is visible is the customer's phone. That is
/// exactly how the Deliverd text went out with an empty Order ID.
///
/// So this sends the real template, through the real send path, with values
/// that say which slot they are: 1-NAME, 2-ORDERID, 3-AWB. Whatever arrives,
/// the SMS reads back the mapping - and a blank space or a swapped pair is
/// then a thing he can see rather than a thing to guess at.
///
/// Owner only, because every press costs money and goes to a real phone.
/// Nothing is written to message_sends: a test must never use up the one slot
/// that stops a real customer being messaged twice.
/// </summary>
[ApiController]
[Route("api/message-test")]
[Authorize]
[RequireOwner]
public class MessageTestController : ControllerBase
{
    private readonly SmsService _sms;
    private readonly ILogger<MessageTestController> _log;

    public MessageTestController(SmsService sms, ILogger<MessageTestController> log)
    {
        _sms = sms;
        _log = log;
    }

    /// One template: our name for it, his DLT name, the Settings box that holds
    /// its flow id, and the variables we send in the order we send them.
    private sealed record Spec(
        string Template, string DltName, string SettingKey, string Trigger, string[] Variables);

    private static readonly Spec[] Specs =
    [
        new(OrderMessenger.OrderConfirm, "OrderConfirm", "msg91TplOrderConfirm",
            "The customer places the order.",
            ["name", "order_id"]),
        new(OrderMessenger.Tracking, "TRAKING NO", "msg91TplTracking",
            "A waybill is generated, by hand or automatically.",
            ["name", "order_id", "awb"]),
        new(OrderMessenger.OutForDelivery, "Out Of Delivery", "msg91TplOutForDelivery",
            "Delhivery says the parcel is on a van today.",
            ["name", "order_id"]),
        new(OrderMessenger.Delivered, "Deliverd", "msg91TplDelivered",
            "Delhivery says the parcel arrived.",
            ["name", "order_id"]),
        new(OrderMessenger.Refund, "Refund3", "msg91TplRefund",
            "An RTO or return comes home and money is owed back.",
            ["name", "order_id", "amount"]),
        new(OrderMessenger.Review, "Review2", "msg91TplReview",
            "One hour after delivery, then twice more every 48 hours.",
            ["name", "order_id", "number"]),
        new(OrderMessenger.UserDropped, "USER_DROPPED2", "msg91TplUserDropped",
            "Someone reached the payment page and did not pay, one hour ago.",
            ["order_id", "date", "amount"]),
    ];

    /// The value that stands in for one variable in a test: its position and
    /// its name, so the SMS reads back its own mapping. "Hello 1-NAME, your
    /// order 2-ORDERID" tells him in one glance what a blank or a swap would
    /// otherwise hide.
    private static string Marker(int position, string variable)
        => position + "-" + variable.Replace("_", "").ToUpperInvariant();

    /// <summary>What we send for each template, and whether its flow id is set.</summary>
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var authKey = await _sms.SettingAsync("msg91AuthKey");
        var sender = await _sms.SettingAsync("msg91SenderId");

        var rows = new List<object>();
        foreach (var s in Specs)
        {
            var id = await _sms.SettingAsync(s.SettingKey);
            rows.Add(new
            {
                template = s.Template,
                dltName = s.DltName,
                settingKey = s.SettingKey,
                trigger = s.Trigger,
                // Whether it is filled in, never what it says. A flow id is not
                // a password, but a settings value read back over the wire is a
                // habit worth not starting.
                configured = !string.IsNullOrWhiteSpace(id),
                variables = s.Variables.Select((v, i) => new
                {
                    position = i + 1,
                    name = v,
                    alsoSentAs = new[] { "var" + (i + 1), "VAR" + (i + 1), v.ToUpperInvariant() },
                    testValue = Marker(i + 1, v),
                }),
            });
        }

        return Ok(new
        {
            smsConfigured = !string.IsNullOrWhiteSpace(authKey),
            senderId = string.IsNullOrWhiteSpace(sender) ? "MAHFHB" : sender!.Trim(),
            templates = rows,
        });
    }

    public class TestRequest
    {
        public string Template { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
    }

    /// <summary>Send one template to one number, with values that name their own slot.</summary>
    [HttpPost]
    public async Task<IActionResult> Send([FromBody] TestRequest req, CancellationToken ct)
    {
        var spec = Specs.FirstOrDefault(s =>
            string.Equals(s.Template, req.Template?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (spec is null)
            return BadRequest(new { ok = false, detail = "That is not one of the seven order messages." });

        var digits = new string((req.Phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length < 10)
            return BadRequest(new { ok = false, detail = "Type the mobile number to send the test to." });

        var templateId = await _sms.SettingAsync(spec.SettingKey);
        if (string.IsNullOrWhiteSpace(templateId))
            return Ok(new
            {
                ok = false,
                detail = "No MSG91 flow id in Settings for this message yet, so nothing was sent.",
                sent = Array.Empty<object>(),
            });

        var values = spec.Variables.Select((v, i) => Marker(i + 1, v)).ToArray();
        var named = spec.Variables
            .Select((v, i) => new { v, m = Marker(i + 1, v) })
            .ToDictionary(x => x.v, x => x.m);

        // The real send path, deliberately. A test that took a shortcut would
        // prove nothing about what a customer receives.
        var (ok, detail) = await _sms.SendTemplateAsync(digits, templateId!, values, named);

        _log.LogInformation("Template test {Template} to {Phone}: {Result}",
            spec.Template, LogSafe.Phone(digits), ok ? "accepted" : detail);

        return Ok(new
        {
            ok,
            detail,
            dltName = spec.DltName,
            sent = spec.Variables.Select((v, i) => new
            {
                position = i + 1,
                name = v,
                value = Marker(i + 1, v),
            }),
            howToRead = ok
                ? "Open the SMS. Every blank in it should hold one of the values above. A blank space means that variable has a different name in the MSG91 flow; two values in the wrong places means the order has to be swapped."
                : "MSG91 refused it, so there is nothing to read on the phone. The reason is above.",
        });
    }
}
