/**
 * What a brand-new campaign's MKT skill whitelist starts as.
 *
 * These are the real submitted values, read verbatim out of `rawFormData` — not
 * a tidied-up version of them. Getting this wrong is silent: a value that is
 * merely close ("Marketing skills" for "Marketing", or "Video editing" and
 * "Audio editing" split out of the single "Video/Audio editing" option) matches
 * nothing and shows a permanent 0.
 *
 * The first three are every distinct value the "Other skills" checkbox can
 * hold. The last two are the soft skills the tally used to hardcode; they live
 * in the "Soft skills" field, which the tally does not read, so they start at 0
 * and are there to be removed or to become countable if a later form moves them
 * into the checkbox field.
 *
 * Starting DATA, not application logic: nothing reads this list except campaign
 * creation and the dev seed. Once a campaign exists, its whitelist is whatever
 * its rows say — the tally never falls back here.
 *
 * Kept free of any database import so `prisma/seed.ts` can share it without
 * pulling in the app's Prisma client.
 */
export const DEFAULT_MKT_SKILLS: readonly string[] = [
  "Illustrator",
  "Marketing",
  "Video/Audio editing",
  "Content writing",
  "Public speaking",
];
