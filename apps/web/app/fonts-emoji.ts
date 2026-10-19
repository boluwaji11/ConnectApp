/**
 * R16.9. One set of emoji, whoever is reading.
 *
 * Left to the machine, a mark against a message is drawn by Apple on one desk,
 * by Microsoft on the next and by a 2010 clip-art set on an old Windows build,
 * so the same thumbs up is three different pictures and two of them date the
 * product. Noto is flat, current, and the same on every screen.
 *
 * This is the one face the product does not serve itself. Google splits Noto
 * Color Emoji into roughly a hundred numbered chunks totalling several
 * megabytes, and a browser fetches only the one or two a page needs. Copying
 * all of it into a public repository to draw a thumbs up is the wrong trade,
 * so it stays a stylesheet link. Nothing is fetched at build time, and a fetch
 * that fails at read time costs the reader the platform's own emoji and
 * nothing else.
 *
 * Every other face is in `public/fonts`, put there by `scripts/fonts.mjs`.
 */
export const EMOJI_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap";
