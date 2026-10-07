import type { Metadata } from 'next';
import { productsApi, settingsApi } from '@/lib/api';
import HomeHero from '@/components/home/HomeHero';
import OfferBanner from '@/components/home/OfferBanner';
import CategoryTiles from '@/components/home/CategoryTiles';
import ProductEdit from '@/components/home/ProductEdit';
import GoogleReviews from '@/components/reviews/GoogleReviews';
import CustomerReviews from '@/components/reviews/CustomerReviews';
import FaqSection from '@/components/home/FaqSection';
import InstagramReels from '@/components/home/InstagramReels';
import { handleOf, parseReels, profileUrlOf } from '@/lib/instagramReels';
import { toListingProducts } from '@/lib/listingProduct';

// Mukhya panna kitni der tak taiyaar rakha jata hai.
//
// 60 second tha. Har 60 second me panna bhula diya jata tha, aur agla aane
// wala banne ka intezar karta tha — WebPageTest par pehla byte aane me 968ms
// lage, jo 2.27s ki poori FCP ka kareeb aadha hissa hai. Cloudflare bhi isi
// ginti par chalta hai (Next khud s-maxage me yahi bhejta hai), to CDN ke
// paas bhi panna sirf ek minute rukta tha.
//
// Paanch minute: naya product panne par das guna kam intezar ke saath aata
// hai, aur dukaandar ko farq itna hi padta hai ki naya saaman 5 minute me
// dikhega 1 minute ke bajay. Products ki poori suchi (/products) par alag se
// 300s pehle se hai, to ye uske saath mel bhi khaata hai.
export const revalidate = 300;

// Homepage SEO — admin-editable from Settings → "SEO — Homepage & Google".
// Falls back to the site defaults (in layout.tsx) when a field is left blank.
export async function generateMetadata(): Promise<Metadata> {
  const res = await settingsApi.getAll().catch(() => ({ settings: {} as Record<string, string> }));
  const s = res.settings ?? {};
  const title = s.seoHomeTitle?.trim();
  const description = s.seoHomeDescription?.trim();
  const keywords = s.seoKeywords?.trim();
  const ogImage = s.seoOgImage?.trim();

  // Mukhya panna apna canonical khud likhta hai. Pehle ye root layout se
  // utarta tha - aur usi ke saath HAR doosre panne par bhi utar jata tha.
  const meta: Metadata = { alternates: { canonical: '/' } };
  if (title) meta.title = { absolute: title };
  if (description) meta.description = description;
  if (keywords) meta.keywords = keywords;
  if (title || description || ogImage) {
    meta.openGraph = {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    };
  }
  return meta;
}

export default async function HomePage() {
  const { products } = await productsApi.getAll({ pageSize: 200 }).catch(() => ({ products: [] as any[] }));
  const all = toListingProducts(products as any[]);

  // The hero photos are read here, on the server, so the first and biggest
  // picture on the site is in the HTML the browser receives. HeroMedia used to
  // fetch them itself after hydrating, which put the page's largest image
  // behind the whole JavaScript bundle. Same call generateMetadata already
  // makes, so Next's data cache answers it without a second round trip.
  const heroSettings = await settingsApi.getAll().catch(() => ({ settings: {} as Record<string, string> }));
  const hs = heroSettings.settings ?? {};
  const validMedia = (v?: string) => /^(https?:\/\/|\/)/.test((v || '').trim());
  const heroVideo = validMedia(hs.heroVideoUrl) ? hs.heroVideoUrl.trim() : null;
  // Six slots. Blanks are dropped, so a shop using three still shows three —
  // the slider is as long as the photos actually set, not as long as the form.
  const heroImgs = Array.from({ length: 6 }, (_, i) => hs[`heroImg${i + 1}`])
    .filter(validMedia) as string[];

  // The Instagram strip, and the one condition it was built under: it goes live
  // from a button in the admin panel and from nowhere else.
  //
  // That switch is read HERE, on the server, which is what makes it a real
  // switch rather than a hidden div. Off means the component is never rendered,
  // so the page carries no heading, no tiles, no poster images and no video
  // requests - there is nothing in the HTML for anyone to find. A section that
  // shipped to every visitor and then hid itself in CSS would still cost them
  // the download, and would still be on the page for Google to read.
  const igOn = (hs.instagramReelsOn ?? '').trim() === 'true';
  const igReels = igOn ? parseReels(hs.instagramReels) : [];

  // The homepage used to be the whole catalogue with a filter sidebar, which is
  // what a category page is for. It is a shop front now: where things are, then
  // two short runs of products, with the full filterable grid one tap away from
  // every one of them. Nothing is hidden — /products still holds all of it.
  const newest = [...all].sort((a, b) => b.dbId - a.dbId);
  const loved = all.filter(p => p.bestSeller);
  // If nothing is marked a best seller, fall back to what sells rather than
  // showing an empty band or, worse, repeating the row above.
  const mostLoved = (loved.length >= 4 ? loved : [...all].sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)))
    .filter(p => !newest.slice(0, 4).some(n => n.dbId === p.dbId));

  return (
    <>
      {/* Hero + offer strip — shown on every device */}
      <HomeHero heroVideo={heroVideo} heroImgs={heroImgs} />
      <OfferBanner />

      <CategoryTiles products={all} />

      <ProductEdit
        eyebrow="The edit"
        title="New this week"
        products={newest}
        href="/products"
        hrefLabel={`See all ${all.length}`}
        priority
      />

      <ProductEdit
        eyebrow="Bought most often"
        title="Most loved"
        products={mostLoved}
        href="/best-sellers"
        hrefLabel="See all"
      />

      {/* Reels, between the products and the reviews.
          This is the handover from "here is the garment" to "here is somebody
          else's word for it", and a short film of the cloth moving belongs on
          that seam rather than at the bottom of the page where nobody reaches.
          Admin: Settings -> As Seen on Instagram. */}
      {igReels.length > 0 && (
        <InstagramReels
          reels={igReels}
          handle={handleOf(hs.instagramHandle)}
          profileUrl={profileUrlOf(hs.instagramHandle)}
        />
      )}

      {/* Desktop-only trust section below the listing */}
      <div className="home-desktop" style={{ marginTop: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
        {/* Live Google rating + reviews (renders only once configured in admin Settings) */}
        <GoogleReviews />
      </div>

      {/* Our own customers, directly above the FAQ — the last thing read before
          the questions, and on a phone as well, which is where most of them are
          read. It shows itself only once there are enough of them. */}
      <CustomerReviews />

      {/* FAQ har chaudai par. Pehle ye .home-desktop ke andar tha, jo 1024px
          se neeche display:none hai - yaani foan par dikhta hi nahi tha. Google
          ab mobile banke hi site padhta hai, to usne FAQPage ka data to padha
          par us panne par wo chhe sawal kahin dikhte nahi the. Google ka niyam
          saaf hai: jo markup me likha hai wo panne par dikhna chahiye; na
          dikhe to rich result to milta hi nahi, haath se saza bhi lag sakti
          hai. Aur foan par FAQ grahak ke liye bhi kaam ki cheez hai. */}
      <FaqSection />
    </>
  );
}
