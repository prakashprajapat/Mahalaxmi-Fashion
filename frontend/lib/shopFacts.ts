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
  /** Jin wajahon se wapsi hoti hai. */
  acceptedReasons: [
    'the product arrived damaged',
    'the product has a manufacturing defect',
    'the wrong product was delivered',
    'an item was missing from the parcel',
    'the product is significantly different from its description',
  ],
  /** Jin wajahon se NAHI hoti. Ye likhna utna hi zaroori hai. */
  excludedReasons: [
    'change of mind',
    'size or fitting issues, unless the wrong size was sent',
    'minor colour differences caused by photography or screen settings',
    'anything used, washed, altered or ironed after delivery',
  ],
  /** Bina iske koi claim nahi chalta — isliye ye chhupa kar rakhne wali baat nahi. */
  videoRequired: true,
  reportDamageWithinHours: 48,
  returnCourier: 'India Post Speed Post',
  returnShippingReimbursedUpTo: 100,
  refundDaysMin: 5,
  refundDaysMax: 7,
  policyPath: '/return-exchange',
} as const;

/** Ek vaakya me wapsi ki sachchai — jahan jagah kam ho wahan yahi likhiye. */
export const RETURNS_SHORT =
  `${RETURNS.windowDays}-day returns for damaged, defective, wrong or missing items. `
  + 'An unedited parcel-opening video is required. Change of mind and size issues are not covered.';

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
