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
 * outline; saved is filled in the shop's maroon. Either difference alone
 * would be enough to see across a room, and somebody who cannot tell red from
 * grey still has the outline against the fill.
 *
 * The path is the one the product page already used, so the heart is the same
 * heart wherever it appears. Colour comes from currentColor, so the button
 * decides it in CSS rather than each caller passing a hex code about.
 *
 * onPhoto is for the one place this sits on a photograph rather than on a
 * white card: the product grid, where the disc behind it has been taken away.
 * There it cannot rely on what is underneath - one row of the women's page
 * has a mustard wall, dark maroon silk, a white marble floor and a green
 * saree in it - so the heart carries its own contrast: filled, with a rim of
 * the opposite tone, both flipping together with the state.
 *
 * Checked by rendering all ten combinations: five backgrounds, saved and not.
 * The first attempt kept the outline heart and made it white; on the marble
 * and on a plain white studio shot it all but disappeared.
 *
 * Everywhere else - the wishlist page, the quick-view - the card behind it is
 * white and known, so nothing is forced and the outline stays.
 */
export default function WishHeart(
  { on, size = 19, onPhoto = false }: { on: boolean; size?: number; onPhoto?: boolean },
) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {/* On a photograph the heart is always a FILLED shape with a rim of
          the opposite tone, and both flip together: white with a dark rim
          when it is not saved, maroon with a white rim when it is.
          A white outline alone was tried first and rendered nearly invisible
          on a pale product shot - which is most of them. */}
      <path
        fill={onPhoto ? (on ? 'currentColor' : '#fff') : (on ? 'currentColor' : 'none')}
        stroke={onPhoto ? (on ? '#fff' : 'rgba(0,0,0,.55)') : 'currentColor'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.3S4.4 15.6 4.4 10.6a4.1 4.1 0 0 1 7.6-2.5 4.1 4.1 0 0 1 7.6 2.5c0 5-7.6 9.7-7.6 9.7Z"
      />
    </svg>
  );
}
