// Dukaan ke wo tathya jinhe koi bhi — grahak, Google, ya AI jo jawab likhta
// hai — padh kar hawala de sakta hai.
//
// Kyun ek jagah: ye hi ankde panne par bhi likhe the, FAQ me bhi, aur schema
// me bhi — aur teenon alag the. Delivery ka samay teen jagah teen tarah se
// likha tha (policy ke panne par 3-7 din, FAQ me 4-8 din, schema me 2-7),
// aur muft shipping ki ₹999 ki seema us panne par thi hi nahi jise padh kar
// koi shipping ke baare me batayega. Jab ek hi sawal ke teen jawab milte hain
// to na Google bharosa karta hai na AI hawala deta hai — aur grahak to bilkul
// nahi.
//
// Ab yahi ek file sach hai. Policy ke panne, FAQ, product ka schema aur
// llms.txt — sab yahan se padhte hain, isliye wo kabhi alag ho hi nahi sakte.
//
// Kuch bhi badalna ho to SIRF yahan badliye.

export const SHOP = {
  name: 'Mahalaxmi Fashion Hub',
  url: 'https://www.mahalaxmifashionhub.com',
  phoneDisplay: '+91 9429429880',
  phoneE164: '+919429429880',
  whatsapp: 'https://wa.me/919429429880',
  street: 'Ward No. 45, Near Mahadev Temple',
  city: 'Balotra',
  state: 'Rajasthan',
  pincode: '344022',
  country: 'IN',
  hoursText: 'Monday to Saturday, 10 AM – 8 PM',
} as const;

export const SHIPPING = {
  /** Order milne se dispatch tak. Policy ke panne par yahi likha hai. */
  processingDaysMin: 1,
  processingDaysMax: 2,
  /** Dispatch se grahak tak — sabse tez aur sabse dheemi jagah ke beech. */
  transitDaysMin: 3,
  transitDaysMax: 8,
  /** Jagah ke hisab se, policy ke panne wali tableaur schema dono ke liye. */
  byRegion: [
    { label: 'Metro cities (Mumbai, Delhi, Bangalore, Chennai and similar)', min: 3, max: 5 },
    { label: 'Tier 2 and Tier 3 cities', min: 4, max: 6 },
    { label: 'Remote and rural areas', min: 5, max: 8 },
  ],
  freeAbove: 999,
  chargeBelow: 60,
  courier: 'Delhivery',
  codAvailable: true,
} as const;

/** Order dene se ghar pahunchne tak, dono sire jodkar. */
export const DELIVERY_TOTAL_MIN = SHIPPING.processingDaysMin + SHIPPING.transitDaysMin;   // 4
export const DELIVERY_TOTAL_MAX = SHIPPING.processingDaysMax + SHIPPING.transitDaysMax;   // 10

export const RETURNS = {
  windowDays: 7,

  // 2 October 2026 se khuli wapsi.
  //
  // Pehle wapsi sirf toote, kharab, galat ya kam aaye saaman par thi — pasand
  // ya naap par nahi. Par site ka schema Google ko "7-day free return" bata
  // raha tha, aur Google wahi apne AI jawab me likhta tha. Grahak us vaade par
  // order karta tha aur baad me "nahi ho sakti" sunta tha.
  //
  // Do hi imaandaar raaste the: ya to vaada chhota karke likh dein, ya policy
  // ko vaade jitna bada kar dein. Maalik ne doosra chuna.
  anyReason: true,

  /** Jo har wapsi par lagu hai. */
  conditions: [
    'the product is unused, unwashed, unworn and still in its original condition',
    'all tags, labels, packaging and accessories are intact',
    'the request is raised within 7 days of delivery',
  ],

  /** Jin par dukaan wapsi ka kharch uthati hai. */
  faultReasons: [
    'the product arrived damaged',
    'the product has a manufacturing defect',
    'the wrong product or wrong size was delivered',
    'an item was missing from the parcel',
    'the product is significantly different from its description',
  ],

  /** Ab bhi kuch cheezein wapas nahi hoti — par ye chhoti soochi hai. */
  excludedReasons: [
    'anything used, washed, worn, altered or ironed after delivery',
    'anything returned without its original tags, packaging or accessories',
    'innerwear, which cannot be resold once opened, for reasons of hygiene',
    'customised or special-order products, unless they arrived damaged or defective',
  ],

  /** Video ab SIRF kharab/galat saaman ke claim par. Pasand ya naap par nahi —
   *  wahan uska koi matlab hi nahi tha, aur wo wapsi ko rokne wali shart ban
   *  gayi thi. */
  videoRequiredForFaults: true,
  reportDamageWithinHours: 48,

  returnCourier: 'India Post Speed Post',
  /** Dukaan ki galti ho to bhejne ka kharch dukaan ka. */
  faultReturnShippingReimbursedUpTo: 100,
  /** Pasand ya naap badalne par bhejne ka kharch grahak ka — warna har badli
   *  hui pasand dukaan ko ₹100 ki padti. */
  remorseReturnShippingPaidBy: 'customer' as const,

  refundDaysMin: 5,
  refundDaysMax: 7,
  policyPath: '/return-exchange',
} as const;

/** Ek vaakya me wapsi — jahan jagah kam ho wahan yahi likhiye. */
export const RETURNS_SHORT =
  `${7}-day returns on any order, including size and change of mind, as long as the product is unused `
  + 'and its tags are intact. If the fault is ours, we pay the return postage.';

export const SIZES = {
  /** Readymade kapdon ki naap. */
  range: 'S to XXL',
  list: ['S', 'M', 'L', 'XL', 'XXL'],
  note: 'Free-size pieces are listed as Free Size. Petticoats and sarees are sold by length, not by this chart.',
} as const;

export const CARE = {
  cotton:
    'Machine wash cold on a gentle cycle or hand wash with mild detergent. '
    + 'Wash dark colours separately for the first two or three washes, dry in shade, and iron on medium heat.',
  saree:
    'Hand wash or dry clean. Keep it out of direct sunlight while drying, fold along a different line each time it is stored, '
    + 'and iron on low heat with a cloth in between.',
  innerwear:
    'Hand wash in cold water with mild detergent, do not bleach, and dry flat in shade.',
  footwear:
    'Wipe with a soft dry cloth after use. Keep away from water and store in a cool, dry place.',
} as const;
