using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MahalaxmiApi.Models;

// One row every time a birthday or anniversary offer actually goes out.
//
// Pehle ye hisab browser ke apne khaane (localStorage) me rehta tha. Natija:
// admin logout karke wapas aata to "Resend" gayab ho jata aur "Send offer"
// wapas aa jata, jabki sandesh ja chuka hota — aur dusri baar bhejne par
// grahak ko wahi offer dobara milti. Phone se bheja hua laptop ko pata nahi
// chalta tha, aur browser ka data saaf karte hi poora hisab mit jata.
//
// Ab ye yahan, database me likha jata hai: ek jagah, sab device ke liye ek hi
// sach. "Kis slab me bheja" bhi saath likha hai, kyunki offer har slab me ek
// baar jati hai (30 din, 15, 7, aur phir wahi din) — yani ek hi grahak ko ek
// saal me chaar baar, par har slab me sirf ek baar.
//
// Year grahak ke DIN ka saal hai, bhejne ka nahi. 28 December ko bheji gayi
// 3 January wali badhai agle saal ke janmdin ki hai, is saal ki nahi.
[Table("celebration_sends")]
public class CelebrationSend
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("customer_id")]
    public int CustomerId { get; set; }

    // birthday | anniversary
    [Column("occasion")]
    public string Occasion { get; set; } = "birthday";

    // 30 | 15 | 7 | 0 — the slab this offer was sent in.
    [Column("slab")]
    public int Slab { get; set; }

    // The year of the occasion itself, not of the sending.
    [Column("year")]
    public int Year { get; set; }

    [Column("coupon_code")]
    public string? CouponCode { get; set; }

    // Dono alag likhe jate hain, kyunki dono alag chalte hain: SMS ruk sakta
    // hai aur email chali ja sakti hai. "Bheja gaya" ka matlab yahan "kam se
    // kam ek raasta chala" hai.
    [Column("sms_sent")]
    public bool SmsSent { get; set; }

    [Column("email_sent")]
    public bool EmailSent { get; set; }

    // MSG91 ka request id — unki report me wahi pankti kholta hai.
    [Column("request_id")]
    public string? RequestId { get; set; }

    [Column("sent_by")]
    public string? SentBy { get; set; }

    [Column("sent_at")]
    public DateTimeOffset SentAt { get; set; } = DateTimeOffset.UtcNow;
}
