// Indian states and UTs - small on purpose, so the checkout can use it without
// pulling in the district lists of lib/indianLocations.ts.
export const STATE_NAMES: string[] = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];

// One spelling per state. Customers type "TN", "BR", "tamilnadu", "WEST BENGAL",
// "Orissa"; all of them become the name in STATE_NAMES. Same table as the
// server's Services/IndianStates.cs, which tidies whatever reaches it anyway.
const STATE_ALIAS: Record<string, string> = {
  an: 'Andaman and Nicobar Islands', andaman: 'Andaman and Nicobar Islands', andamannicobar: 'Andaman and Nicobar Islands', andamanandnicobar: 'Andaman and Nicobar Islands',
  ap: 'Andhra Pradesh', ar: 'Arunachal Pradesh', as: 'Assam', br: 'Bihar',
  ch: 'Chandigarh', cg: 'Chhattisgarh', ct: 'Chhattisgarh', chattisgarh: 'Chhattisgarh', chhatisgarh: 'Chhattisgarh',
  dn: 'Dadra and Nagar Haveli and Daman and Diu', dd: 'Dadra and Nagar Haveli and Daman and Diu',
  dadranagarhaveli: 'Dadra and Nagar Haveli and Daman and Diu', dadraandnagarhaveli: 'Dadra and Nagar Haveli and Daman and Diu',
  damananddiu: 'Dadra and Nagar Haveli and Daman and Diu', damandiu: 'Dadra and Nagar Haveli and Daman and Diu',
  dl: 'Delhi', newdelhi: 'Delhi', nctofdelhi: 'Delhi', nctdelhi: 'Delhi', delhincr: 'Delhi',
  ga: 'Goa', gj: 'Gujarat', gujrat: 'Gujarat', hr: 'Haryana', hp: 'Himachal Pradesh',
  jk: 'Jammu and Kashmir', jammukashmir: 'Jammu and Kashmir', jammu: 'Jammu and Kashmir', kashmir: 'Jammu and Kashmir',
  jh: 'Jharkhand', ka: 'Karnataka', kl: 'Kerala', la: 'Ladakh', ld: 'Lakshadweep',
  mp: 'Madhya Pradesh', mh: 'Maharashtra', maharastra: 'Maharashtra', mn: 'Manipur', ml: 'Meghalaya',
  mz: 'Mizoram', nl: 'Nagaland', od: 'Odisha', or: 'Odisha', orissa: 'Odisha',
  py: 'Puducherry', pondicherry: 'Puducherry', pondy: 'Puducherry', pb: 'Punjab',
  rj: 'Rajasthan', raj: 'Rajasthan', sk: 'Sikkim', tn: 'Tamil Nadu', tamilnad: 'Tamil Nadu',
  ts: 'Telangana', tg: 'Telangana', telengana: 'Telangana', tr: 'Tripura',
  up: 'Uttar Pradesh', uk: 'Uttarakhand', ut: 'Uttarakhand', uttaranchal: 'Uttarakhand', uttrakhand: 'Uttarakhand',
  wb: 'West Bengal', westbangal: 'West Bengal', bengal: 'West Bengal',
};
const stateKey = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const STATE_BY_KEY: Record<string, string> = Object.fromEntries(STATE_NAMES.map(s => [stateKey(s), s]));
const STATES_LONGEST_FIRST = [...STATE_NAMES].sort((a, b) => b.length - a.length);

/** The proper state name; an unrecognised value comes back trimmed, never lost. */
export function normalizeState(raw?: string | null): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  const k = stateKey(t);
  if (!k) return t;
  if (STATE_BY_KEY[k]) return STATE_BY_KEY[k];
  if (STATE_ALIAS[k]) return STATE_ALIAS[k];
  for (const s of STATES_LONGEST_FIRST) if (k.includes(stateKey(s))) return s;
  return t;
}
