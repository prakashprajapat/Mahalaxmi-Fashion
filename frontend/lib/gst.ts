// Which tax heads a sale carries, and where the shop is registered.
//
// GST splits one tax two ways. A sale that stays inside the shop's own state
// is CGST + SGST, half each; a sale that crosses a state line is IGST, the
// whole amount in one head. The figure is identical either way, so getting it
// wrong costs nothing arithmetically and everything legally: the buyer cannot
// claim credit against the wrong head, and the return will not reconcile.
//
// The GSTR-1 export already knew this. The printed tax invoice did not, and
// said CGST + SGST on every parcel - including the ones going to Tamil Nadu,
// West Bengal and Maharashtra, which is nearly all of them. One rule, one
// place, so the paper and the return cannot disagree again.

// Balotra, Rajasthan - GSTIN 08..., and 08 is Rajasthan.
export const HOME_STATE = 'rajasthan';

const norm = (s?: string | null) => String(s ?? '').trim().toLowerCase();

// True only when the delivery state is the shop's own.
//
// An unknown state is treated as inter-state on purpose. Charging IGST where
// CGST + SGST was due is a correctable mistake on one invoice; charging the
// local heads on an interstate sale understates what the other state is owed,
// and that is the error that is expensive to unwind.
export function isIntraState(state?: string | null): boolean {
  const s = norm(state);
  return s.length > 0 && s === HOME_STATE;
}

// One tax amount, split into the heads that sale actually carries.
export function taxHeads(totalTax: number, state?: string | null): {
  cgst: number; sgst: number; igst: number; intra: boolean;
} {
  const t = Number(totalTax) || 0;
  const intra = isIntraState(state);
  return intra
    ? { cgst: t / 2, sgst: t / 2, igst: 0, intra }
    : { cgst: 0, sgst: 0, igst: t, intra };
}

// What the invoice prints under HSN, e.g. "CGST + SGST" or "IGST".
export const taxHeadLabel = (state?: string | null) =>
  isIntraState(state) ? 'CGST + SGST' : 'IGST';
