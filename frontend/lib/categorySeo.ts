// Per-category SEO content: richer meta title/description + on-page intro copy + FAQs.
// This gives each category page unique, keyword-relevant text (instead of one thin line),
// which helps the page rank and gives Google FAQ rich-result eligibility.

export interface CategorySeo {
  title: string;        // <title> — keep under ~60 chars
  description: string;  // meta description — keep under ~160 chars
  heading: string;      // on-page H2 for the SEO section
  intro: string[];      // 1–2 paragraphs of genuine, keyword-relevant copy
  faqs: { q: string; a: string }[];
}

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  women: {
    title: "Women's Ethnic Wear — Sarees, Nighty & Petticoats Online",
    description:
      "Shop women's ethnic wear at Mahalaxmi Fashion Hub — designer sarees, cotton nighties, petticoats & daily wear. Balotra, Rajasthan. Free shipping over ₹999.",
    heading: "Women's Ethnic & Daily Wear at Mahalaxmi Fashion Hub",
    intro: [
      "Explore our women's collection — from festive designer sarees and comfortable cotton nighties to everyday petticoats and fabric essentials. Each piece is hand-picked for quality fabric, fit and finish, so you get boutique-style clothing at honest prices.",
      "Based in Balotra, Rajasthan, we ship across India with careful packing and order tracking. Not sure about size, colour or availability? Message us on WhatsApp before ordering and our team will help you personally.",
    ],
    faqs: [
      { q: "What kind of women's clothing do you sell?", a: "We offer designer and daily-wear sarees, cotton and hosiery nighties, petticoats, and fabric materials for stitching — all curated for quality and comfort." },
      { q: "Do you deliver across India?", a: "Yes. We ship pan-India with tracking, and delivery is free on orders above ₹999. Local Balotra delivery is available too." },
      { q: "Can I get help choosing size or colour before ordering?", a: "Absolutely — message us on WhatsApp with the product name and we'll guide you on size, fabric and availability before you place the order." },
      { q: "What is your return and exchange policy?", a: "We offer easy 7-day returns and exchanges on eligible orders. Please keep the parcel-opening video for any return or damage claim." },
    ],
  },
  men: {
    title: "Men's Fabrics & Ethnic Wear Online — Mahalaxmi Fashion Hub",
    description:
      "Shop men's shirting & suiting fabrics and ethnic wear at Mahalaxmi Fashion Hub, Balotra. Quality cloth materials at honest prices. Free shipping over ₹999.",
    heading: "Men's Fabrics & Ethnic Wear",
    intro: [
      "Our men's range focuses on premium shirting and suiting fabrics, along with ethnic wear essentials. Whether you're tailoring a festive kurta or a formal shirt, you'll find durable, good-looking cloth materials chosen for their weave and finish.",
      "We're a Balotra, Rajasthan based store shipping across India with tracking. Need a specific colour, meterage or fabric type? Just WhatsApp us and we'll confirm stock and help you pick the right material.",
    ],
    faqs: [
      { q: "What men's products are available?", a: "Mainly shirting and suiting fabrics and ethnic-wear cloth materials, ideal for tailoring kurtas, shirts and festive outfits." },
      { q: "Can I order fabric by the metre?", a: "Yes — message us on WhatsApp with the fabric and the meterage you need, and we'll confirm availability and pricing." },
      { q: "Is delivery available across India?", a: "Yes, we ship pan-India with order tracking, and shipping is free on orders above ₹999." },
    ],
  },
  kids: {
    title: "Kids' Clothing Online — Comfortable & Cute | Mahalaxmi Fashion",
    description:
      "Shop cute, comfortable kids' clothing at Mahalaxmi Fashion Hub, Balotra. Soft fabrics for daily and festive wear. Free shipping over ₹999, easy returns.",
    heading: "Comfortable & Cute Kids' Clothing",
    intro: [
      "Our kids' collection is all about soft, skin-friendly fabrics and playful designs for both daily and festive wear. We pick materials that are gentle, breathable and easy to care for, so little ones stay comfortable all day.",
      "Shipping pan-India from Balotra, Rajasthan, with careful packing and tracking. Have a question on size or fabric? WhatsApp us and we'll help you choose the right fit before ordering.",
    ],
    faqs: [
      { q: "Are the kids' fabrics skin-friendly?", a: "Yes — we prioritise soft, breathable, comfortable materials suitable for children's daily and festive wear." },
      { q: "How do I pick the right size for my child?", a: "Message us on WhatsApp with your child's age or measurements and we'll recommend the best fit." },
      { q: "Do you offer returns on kids' items?", a: "Yes, eligible orders can be returned or exchanged within 7 days. Keep the parcel-opening video for any claim." },
    ],
  },
  beauty: {
    title: "Beauty & Personal Care Products Online | Mahalaxmi Fashion Hub",
    description:
      "Shop beauty and personal care essentials at Mahalaxmi Fashion Hub, Balotra. Genuine products at honest prices. Free shipping over ₹999, easy returns.",
    heading: "Beauty & Personal Care Essentials",
    intro: [
      "Discover our beauty and personal care picks — everyday essentials selected for quality and value. We keep our range honest and useful, so you can add your favourites to your fashion order in one place.",
      "Delivered pan-India from Balotra, Rajasthan, with secure packing and tracking. Looking for a specific product? WhatsApp us to check availability and get a quick recommendation.",
    ],
    faqs: [
      { q: "Are your beauty products genuine?", a: "Yes, we stock genuine products and pack them securely for safe delivery." },
      { q: "Can I combine beauty items with a clothing order?", a: "Yes — add beauty and fashion items to the same cart and check out together." },
      { q: "Is free shipping available?", a: "Shipping is free on orders above ₹999, with pan-India delivery and tracking." },
    ],
  },
  fabrics: {
    title: "Premium Fabrics & Cloth Materials Online | Mahalaxmi Fashion Hub",
    description:
      "Buy premium fabrics & cloth materials online at Mahalaxmi Fashion Hub, Balotra, Rajasthan. Popline, cotton & more for stitching. Free shipping over ₹999.",
    heading: "Premium Fabrics & Cloth Materials",
    intro: [
      "Our fabric collection features quality cloth materials — from popline and cotton to festive and daily-wear fabrics — perfect for tailoring sarees, suits, kurtas and more. Every fabric is chosen for its weave, feel and durability.",
      "As a Balotra, Rajasthan textile store, we ship fabrics across India with careful packing. Tell us the fabric type, colour and meterage you need on WhatsApp and we'll confirm stock and pricing right away.",
    ],
    faqs: [
      { q: "What types of fabric do you sell?", a: "We offer popline, cotton and a range of festive and daily-wear cloth materials suitable for stitching sarees, suits and kurtas." },
      { q: "Can I buy fabric by the metre?", a: "Yes — WhatsApp us with the fabric and meterage required and we'll confirm availability and price." },
      { q: "Do you ship fabric across India?", a: "Yes, we ship pan-India with tracking, and delivery is free on orders above ₹999." },
    ],
  },
};
