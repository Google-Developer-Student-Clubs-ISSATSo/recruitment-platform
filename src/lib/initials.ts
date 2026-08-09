/**
 * Avatar initials for a person's name — the ONE implementation.
 *
 * Every word contributes its first letter, with no cap: "Lina Chaabane" → "LC",
 * "Ons El Maleh" → "OEM". The old per-component copies took only the first two
 * words (and PanelBoard's took first + last), so a three-word name rendered
 * "OE" in three places and "OM" in a fourth for the same person.
 *
 * Deliberately uncapped: the longest real name in the data is three words, so a
 * cap would only ever fire on hypothetical input. If names ever get long enough
 * to overflow the avatar, cap here — not at a call site, or the copies come back.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // Single-word names have no second initial to give, so borrow the second
  // letter rather than rendering a lonely glyph ("test" → "TE").
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((w) => w.charAt(0).toUpperCase()).join("");
}
