// Blog content. Each post is server-rendered with its own SEO metadata + Article JSON-LD,
// which gives the site fresh, keyword-relevant pages that can rank for long-tail searches
// (e.g. "how to choose a saree", "cotton nighty fabric guide", "petticoat size chart").
//
// To add a new article, just append an object to POSTS. `content` is trusted HTML we author
// ourselves (no user input), rendered via dangerouslySetInnerHTML.

export interface BlogPost {
  slug: string;
  title: string;
  description: string;   // meta description (~150–160 chars)
  date: string;          // ISO date, e.g. "2026-07-07"
  readMinutes: number;
  excerpt: string;       // shown on the blog index
  content: string;       // HTML body
}

export const POSTS: BlogPost[] = [
  {
    slug: 'how-to-choose-the-perfect-saree',
    title: 'How to Choose the Perfect Saree for Every Occasion',
    description:
      'A simple guide to choosing the right saree — fabric, colour and drape for weddings, festivals and daily wear. Tips from Mahalaxmi Fashion Hub, Balotra.',
    date: '2026-07-07',
    readMinutes: 4,
    excerpt:
      'Confused between silk, cotton and georgette? Here is a simple, practical way to pick the right saree for weddings, festivals and everyday wear.',
    content: `
      <p>A saree is timeless, but with so many fabrics, colours and drapes, choosing the right one can feel overwhelming. Here is a simple, practical approach we share with our customers every day.</p>

      <h2>1. Start with the occasion</h2>
      <p>The event decides almost everything. For <strong>weddings and big festivals</strong>, richer fabrics like silk or heavily worked georgette look grand. For <strong>daily wear and office</strong>, soft cotton and cotton-blend sarees are comfortable, breathable and easy to manage. For <strong>casual outings</strong>, lightweight prints strike the right balance.</p>

      <h2>2. Pick a fabric that suits your comfort</h2>
      <ul>
        <li><strong>Cotton:</strong> Breathable and easy to drape — perfect for hot weather and everyday use.</li>
        <li><strong>Silk:</strong> Rich, festive look with a beautiful fall — ideal for special occasions.</li>
        <li><strong>Georgette / chiffon:</strong> Flowy and flattering, great for parties and evening events.</li>
      </ul>

      <h2>3. Choose colours that flatter you</h2>
      <p>Deep reds, maroons and golds suit festive occasions and most skin tones. Pastels and soft shades feel fresh for daytime events. If you are unsure, a solid colour with a contrasting border is a safe, elegant choice.</p>

      <h2>4. Mind the drape and length</h2>
      <p>A standard saree is around 5.5 metres, with 6.3 metres if you want a matching blouse piece. Heavier fabrics hold pleats better; lighter fabrics drape softly. Always pair the saree with a well-fitted petticoat and blouse for the best look.</p>

      <h2>5. Still not sure? Ask us</h2>
      <p>At Mahalaxmi Fashion Hub, Balotra, we help you choose the right saree before you order. Just message us on WhatsApp with the occasion and your preference, and we will recommend options, confirm fabric and share real photos.</p>
    `,
  },
  {
    slug: 'cotton-nighty-buying-guide',
    title: 'Cotton Nighty Buying Guide: Fabric, Fit & Comfort',
    description:
      'How to choose a comfortable cotton nighty — the right fabric, fit, and care tips for all seasons. A practical guide from Mahalaxmi Fashion Hub.',
    date: '2026-07-07',
    readMinutes: 3,
    excerpt:
      'The right nighty is all about comfort. Here is how to pick the best fabric, fit and style for a good night’s sleep in every season.',
    content: `
      <p>A good nighty is the difference between tossing all night and sleeping peacefully. Comfort comes down to three things: fabric, fit and finish. Here is what to look for.</p>

      <h2>1. Fabric first</h2>
      <p>For daily wear and Indian weather, <strong>cotton and hosiery cotton</strong> are hard to beat — they are soft, breathable and absorb sweat, keeping you cool. For winter, a slightly heavier knit adds warmth without feeling heavy.</p>

      <h2>2. Get the fit right</h2>
      <p>A nighty should be loose enough to move freely but not so baggy that it tangles while you sleep. Check the length and sleeve style based on the season — short sleeves for summer, full sleeves for winter.</p>

      <h2>3. Look at the small details</h2>
      <ul>
        <li>Soft, non-scratchy seams and neckline.</li>
        <li>Good stitching that survives regular washing.</li>
        <li>A design you actually like — feeling good matters too.</li>
      </ul>

      <h2>4. Care tips to make it last</h2>
      <p>Wash cotton nighties in cold or lukewarm water, avoid harsh bleach, and dry in shade to keep colours bright. Turning them inside out before washing protects prints.</p>

      <h2>5. Shop with confidence</h2>
      <p>Our cotton nighties are chosen for soft fabric and honest quality. Not sure about size or fabric? WhatsApp us and we will guide you before you order — with real photos and stock confirmation.</p>
    `,
  },
  {
    slug: 'petticoat-size-and-fabric-guide',
    title: 'Petticoat Guide: Right Size, Fabric & Colour',
    description:
      'How to choose the right petticoat — size, fabric and colour to match your saree perfectly. A quick, practical guide from Mahalaxmi Fashion Hub, Balotra.',
    date: '2026-07-07',
    readMinutes: 3,
    excerpt:
      'The petticoat is the hidden hero of a good saree drape. Here is how to choose the right size, fabric and colour so your saree sits perfectly.',
    content: `
      <p>The petticoat may be hidden, but it decides how well your saree drapes and how comfortable you feel all day. Here is how to get it right.</p>

      <h2>1. Choose the correct size</h2>
      <p>Petticoats usually come in standard sizes (S, M, L, XL and up) based on waist measurement. Measure your waist and pick a size with a little room — a drawstring or elastic waist gives the best adjustable fit.</p>

      <h2>2. Match the fabric to the saree</h2>
      <ul>
        <li><strong>Cotton petticoat:</strong> Breathable and comfortable for daily and cotton sarees.</li>
        <li><strong>Satin / silk-blend petticoat:</strong> Smooth fall for silk and party sarees.</li>
        <li>Firm fabric holds pleats better; soft fabric drapes lighter.</li>
      </ul>

      <h2>3. Pick a colour that blends in</h2>
      <p>The safest choice is a colour close to your saree — or a neutral like beige, black or white that works with many sarees. For sheer sarees, matching the petticoat colour to the saree is important so it doesn’t show through.</p>

      <h2>4. Comfort and length</h2>
      <p>The petticoat should end just above the floor, so the saree falls neatly without dragging. A comfortable waistband makes a big difference over a long day.</p>

      <h2>5. Need help matching?</h2>
      <p>Send us your saree colour and waist size on WhatsApp, and we will suggest the right petticoat fabric, size and shade — so everything comes together perfectly.</p>
    `,
  },
];

export const getPost = (slug: string) => POSTS.find(p => p.slug === slug);
