/**
 * The heart on a product, in one place.
 *
 * It used to be two emoji - a red one for saved and a white one for not - and
 * at 34 pixels on a white circle those are the same picture. The shopper taps
 * it, something happens, and there is no way to tell what: the complaint that
 * started this was exactly that, before an emoji sweep blanked both of them
 * and made it worse.
 *
 * Shape carries the state, and colour carries it again. Not saved is an
 * outline in grey; saved is filled in the shop's maroon, on a tinted circle.
 * Either difference alone would be enough to see across a room, and somebody
 * who cannot tell red from grey still has the outline against the fill.
 *
 * The path is the one the product page already used, so the heart is the same
 * heart wherever it appears. Colour comes from currentColor, so the button
 * decides it in CSS rather than each caller passing a hex code about.
 */
export default function WishHeart({ on, size = 19 }: { on: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.3S4.4 15.6 4.4 10.6a4.1 4.1 0 0 1 7.6-2.5 4.1 4.1 0 0 1 7.6 2.5c0 5-7.6 9.7-7.6 9.7Z"
      />
    </svg>
  );
}
