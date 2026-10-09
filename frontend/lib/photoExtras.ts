// Photos past the four named views, and the one way they are stored.
//
// Front, side, back and zoomed are the four every garment should have, so they
// keep their names and their places. Everything after them - a fabric close-up,
// the stitched label, the same kurti on somebody taller - is just "another
// photo". There is no name worth giving those, so they are numbered: extra1,
// extra2, and so on.
//
// Numbered keys rather than a nested array, because both places that hold
// photos are flat maps of named slots (productPhotos, and each pack column),
// and every reader of them walks a list of key names. A nested array would have
// meant two shapes and two readers, and the reader that got forgotten is the
// one that silently drops half a product's photographs.
//
// This file exists because the same twelve lines had been written three times -
// in the product page, the quick view, and the edit screen's loader - and the
// fourth copy is where a sort gets left out and photo 10 appears before photo 2.

/** Four named views plus six more. Ten is where a customer stops scrolling. */
export const MAX_PHOTOS = 10;
export const MAX_EXTRA = MAX_PHOTOS - 4;

/**
 * The numbered photos out of a stored slot map, in their own order.
 *
 * Sorted by the number, not by the key: a plain string sort puts extra10
 * between extra1 and extra2, which is how the tenth photograph ends up second
 * in the gallery.
 */
export function numberedExtras(slots: Record<string, unknown> | null | undefined): string[] {
  if (!slots) return [];
  return Object.keys(slots)
    .filter(k => /^extra\d+$/.test(k))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .map(k => slots[k])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .slice(0, MAX_EXTRA);
}

/**
 * The other way round: a list of photos written back out as extra1..extraN.
 *
 * It tolerates a missing list rather than throwing, because the one caller that
 * can hand it one is a product being SAVED - a column loaded from older data
 * that has no extras field at all. Crashing there would lose the whole save.
 */
export function asNumberedExtras(extra: (string | undefined)[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  (extra ?? [])
    .map(v => (v ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_EXTRA)
    .forEach((url, i) => { out[`extra${i + 1}`] = url; });
  return out;
}

/** Every photo in a stored slot map, named views first, in gallery order. */
export function allSlotPhotos(slots: Record<string, unknown> | null | undefined): string[] {
  if (!slots) return [];
  const named = ['front', 'side', 'back', 'zoomed']
    .map(k => slots[k])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return [...named, ...numberedExtras(slots)];
}

/**
 * Ek rang (custom colour) ki apni photos — wahi slot map jo productPhotos aur
 * har pack column hai.
 *
 * Rang ka record sabse pehle sirf { name, code, photo } tha, isliye uski pehli
 * photo aaj bhi `photo` me rehti hai, `front` me nahi. Naye slot (side, back,
 * zoomed, extra1…) uske saath jude hain. Isse 102 purane products ka data
 * waisa ka waisa chalta rehta hai — koi migration nahi — aur padhne wala
 * reader wahi ek allSlotPhotos rehta hai.
 */
export function colourSlots(
  c: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!c) return {};
  const extras = Object.fromEntries(
    Object.entries(c).filter(([k]) => /^extra\d+$/.test(k)),
  );
  return { front: c.photo, side: c.side, back: c.back, zoomed: c.zoomed, ...extras };
}

/** Us rang ki saari photos, gallery ke kram me. Koi na ho to khali list. */
export function colourPhotos(c: Record<string, unknown> | null | undefined): string[] {
  return allSlotPhotos(colourSlots(c));
}

/** One colour a product offers, with its own photos, in the shape colourPhotos reads. */
export type ColourSet = Record<string, unknown> & { name: string; photo?: string; code?: string };

/**
 * Every colour a product offers, as ONE list, whatever screen filled it in.
 *
 * Two screens were writing the same thing and the storefront read only one of
 * them. A plain product got its colours from "Add Custom Colour"; a pack got
 * them from the photo columns - and the product page, which read customColors
 * alone, showed a pack no colours at all. MFH1202 had five colours typed in
 * with five photo sets behind them, and its page offered a size and nothing
 * else. Reading two lists and believing one is how that happens, so now there
 * is one list and everything downstream reads it.
 *
 * Order matters: the main photo set first (it is the colour the page opens
 * on), then the columns, then the picker. A name appearing twice keeps the
 * entry that actually has photographs, so a bare name typed into the picker
 * can never hide a column's pictures.
 */
export function colourSetsOf(extra: Record<string, unknown> | null | undefined): ColourSet[] {
  if (!extra) return [];
  const e = extra as Record<string, any>;
  const name = (v: unknown) => String(v ?? '').trim();

  const mainName = name(e.productPhotosColour);
  const fromMain: ColourSet[] = mainName
    ? [{ ...(e.productPhotos ?? {}), name: mainName, photo: (e.productPhotos ?? {}).front }]
    : [];

  const cols: Array<Record<string, any>> = e.packColumnPhotos ?? e.packImages ?? e.variantColumns ?? [];
  const fromCols: ColourSet[] = cols
    .filter(c => c && typeof c === 'object' && name(c.colour ?? c.colorName ?? c.color))
    .map(c => {
      // `letter` is the slot, not a colour, and `front` is spelled `photo`
      // everywhere else - drop the one, rename the other, and the column is
      // the same shape as every other colour.
      const { letter, colour, colorName, color, front, ...rest } = c;
      return { ...rest, name: name(colour ?? colorName ?? color), photo: front };
    });

  // When columns carry names, THEY are the list. The picker on a pack product
  // collects names nobody attached photographs to - MFH1202 had Maroon sitting
  // there with no pictures while its four columns held Cream, Light Pink,
  // Lavender and Peach - and a customer offered a colour that has no photo and
  // no stock row behind it is being offered something that does not exist.
  // A picker entry with photos of its own is still real, so it stays.
  const fromPicker: ColourSet[] = (e.customColors ?? [])
    .filter((c: any) => c && name(c.name))
    .map((c: any) => ({ ...c, name: name(c.name) }))
    .filter((c: ColourSet) => fromCols.length === 0 || colourPhotos(c).length > 0);

  const byName = new Map<string, ColourSet>();
  for (const c of [...fromMain, ...fromCols, ...fromPicker]) {
    const k = c.name.toLowerCase();
    const prev = byName.get(k);
    if (!prev || (colourPhotos(prev).length === 0 && colourPhotos(c).length > 0)) byName.set(k, c);
  }
  return [...byName.values()];
}
