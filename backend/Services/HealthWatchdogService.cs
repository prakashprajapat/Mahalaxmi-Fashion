using System.Net;
using MahalaxmiApi.Data;

namespace MahalaxmiApi.Services;

/// <summary>
/// Har paanch minute me wahi jaanch jo /api/health karta hai, aur kharabi
/// milne par admin ko mail.
///
/// Iski ek seema saaf samajh leni chahiye: ye server ke ANDAR chalta hai.
/// Jis din server hi band hoga - ya hosting band, ya firewall ne sabko rok
/// diya, jaisa 8 Oct ko 522 me hua - tab ye bhi band hoga aur ek bhi mail
/// nahi jayegi. "Site band hai" wala alert sirf bahar baithi koi service hi
/// bhej sakti hai. Ye service uske badle me nahi, uske SAATH kaam karti hai:
/// ye wo kharabi pakadti hai jo bahar se dikhti hi nahi - database gir gaya
/// par homepage abhi bhi khul raha hai, disk bharne wali hai, deploy fail
/// hokar rollback ho gaya.
///
/// Shor na ho, iska dhyan rakha gaya hai. Ek hi kharabi par baar-baar mail
/// aaye to teesri mail ke baad shop padhna band kar deti hai, aur phir asli
/// wali bhi anpadhi reh jati hai. Isliye: kharabi shuru hone par ek mail,
/// phir chhe ghante me ek yaad-dahani, aur theek hone par ek "theek ho gaya".
/// </summary>
public class HealthWatchdogService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<HealthWatchdogService> _log;

    private static readonly TimeSpan Interval  = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan Reminder  = TimeSpan.FromHours(6);

    // Yaad sirf memory me hai. App restart hone par ye bhool jata hai - aur
    // yeh theek hai: restart ka matlab hai app wapas chal pada, aur agar
    // kharabi abhi bhi hai to agli jaanch use nayi maankar dobara bata degi.
    private string _lastSignature = "";
    private DateTimeOffset _lastSentAt = DateTimeOffset.MinValue;

    public HealthWatchdogService(
        IServiceScopeFactory scopeFactory,
        IWebHostEnvironment env,
        ILogger<HealthWatchdogService> log)
    {
        _scopeFactory = scopeFactory;
        _env = env;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // App ko poora shuru ho lene do. Shuruaat me database ka pehla
        // connection banne me waqt lagta hai, aur us dauraan ki jaanch jhoothi
        // kharabi bata degi.
        try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await CheckAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Health watchdog sweep failed."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task CheckAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var notifier = scope.ServiceProvider.GetRequiredService<AdminNotifier>();

        var problems = await HealthChecks.RunAsync(db, _env, ct);

        // deploy.sh rollback karte waqt ye file chhod jata hai. Rollback apne
        // aap me kaamyab hota hai - site chalti rehti hai - isliye bahar se
        // kuch galat dikhta hi nahi, aur subah tak kisi ko pata nahi chalta ki
        // raat ka deploy gira tha aur site purane code par hai.
        var marker = Path.Combine(_env.ContentRootPath, "DEPLOY-FAILED");
        string? deployNote = null;
        try
        {
            if (File.Exists(marker))
            {
                deployNote = (await File.ReadAllTextAsync(marker, ct)).Trim();
                if (deployNote.Length > 300) deployNote = deployNote[..300];
                problems.Add(new HealthProblem("deploy", string.IsNullOrWhiteSpace(deployNote)
                    ? "pichhla deploy fail hokar rollback hua" : deployNote));
            }
        }
        catch (Exception ex) { _log.LogWarning(ex, "Could not read the deploy marker."); }

        var signature = string.Join("|", problems.Select(p => p.Part).OrderBy(x => x));
        var now = DateTimeOffset.UtcNow;

        if (problems.Count == 0)
        {
            if (_lastSignature.Length > 0)
            {
                await notifier.NotifyAsync(
                    "Mahalaxmi: sab theek ho gaya",
                    AdminNotifier.Wrap("Theek ho gaya", $@"
<p style=""margin:0 0 12px"">Jo kharabi pehle batayi thi, wo ab nahi hai.</p>
<p style=""margin:0;color:#666;font-size:13px"">Pehle: <b>{WebUtility.HtmlEncode(_lastSignature)}</b><br>
Jaancha gaya: {IndiaTime.Now:dd MMM yyyy, h:mm tt} IST</p>"));
                _lastSignature = "";
                _lastSentAt = DateTimeOffset.MinValue;
            }
            // Marker tabhi hatao jab alert ja chuka ho, warna wo khabar
            // chupchap gum ho jati hai.
            try { if (File.Exists(marker)) File.Delete(marker); } catch { /* agli baar sahi */ }
            return;
        }

        var isNew = signature != _lastSignature;
        var dueAgain = now - _lastSentAt >= Reminder;
        if (!isNew && !dueAgain) return;

        var rows = string.Join("", problems.Select(p => $@"
<tr><td style=""padding:6px 0;font-weight:700;width:110px"">{WebUtility.HtmlEncode(p.Part)}</td>
    <td style=""padding:6px 0;color:#444"">{WebUtility.HtmlEncode(p.Detail)}</td></tr>"));

        await notifier.NotifyAsync(
            isNew ? "Mahalaxmi: website me kharabi" : "Mahalaxmi: kharabi abhi tak theek nahi hui",
            AdminNotifier.Wrap(isNew ? "Kharabi mili" : "Kharabi abhi tak hai", $@"
<table style=""width:100%;border-collapse:collapse;font-size:14px"">{rows}</table>
<p style=""margin:14px 0 0;color:#666;font-size:13px"">
  Jaancha gaya: {IndiaTime.Now:dd MMM yyyy, h:mm tt} IST<br>
  Ye jaanch server ke andar se hui hai, yani server us waqt chal raha tha.
</p>"));

        _lastSignature = signature;
        _lastSentAt = now;
        _log.LogWarning("Health watchdog alert sent: {Signature}", signature);
    }
}
