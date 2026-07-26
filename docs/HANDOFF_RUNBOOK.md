# GDGC Recruitment Platform --- Ownership & Handoff Runbook

This file exists so the platform survives people changing every year. There are **two different
handoffs** covered here --- they're separate, on separate timelines, run by different people.

1. **TM Lead** --- rotates yearly, before recruitment starts, handled *inside the app itself*.
2. **Tech Lead** --- the technical maintainer, changes hands whenever that person changes
   (not necessarily yearly), handled *outside the app*, at the infrastructure level.

---

## 1. What lives where

| Thing | Where it lives | Who can see it |
|---|---|---|
| Database connection string | Vercel project environment variables **only** --- never in git, never written down elsewhere | Whoever has Vercel project access (the Tech Lead) |
| Vercel account | Signed up with a dedicated Tech Lead email, created at deployment time | The Tech Lead |
| Supabase account | Signed up with the same dedicated Tech Lead email | The Tech Lead |
| Vercel/Supabase passwords | A password-protected document in the club Google Drive | Current Tech Lead; recoverable via that dedicated email's own recovery options |
| Platform Administrator (TM Lead) role | Inside the app itself, via the permission system | Transferred yearly through the in-app invite/accept flow --- see Section 2 |
| GitHub repo | `Google-Developer-Student-Clubs-ISSATSo` organization | Tech Lead + club members with repo access |

Two separate identities, two separate purposes: the **Tech Lead's dedicated email** owns the
infrastructure (Vercel, Supabase, GitHub deploys), while the **TM Lead's in-app Administrator
role** owns the recruitment process itself. Nobody needs infrastructure access just to run
recruitment, and nobody needs to be TM Lead just to maintain the code.

---

## 2. TM Lead Handoff (yearly, in-app)

Do this when the new TM Lead is chosen, before recruitment starts:

1. The outgoing TM Lead opens **Transfer Admin Role** in the app and enters the incoming TM
   Lead's email.
2. The incoming TM Lead gets an email with an accept link. **Nothing changes until they accept**
   --- the outgoing TM Lead stays fully in control until then.
3. Once accepted: the incoming person becomes the sole Administrator automatically, and the
   outgoing TM Lead is automatically stepped down to a **TM Reviewer** (they keep their
   screening/interview access, just not admin control).
4. If the invite was sent to the wrong email, the outgoing TM Lead can cancel the pending invite
   and resend it --- as long as they haven't already been replaced.

That's the entire handoff. No credentials change hands, because none are needed --- the TM Lead
role has never required touching the database or hosting directly.

---

## 3. Tech Lead Handoff (whenever the maintainer changes)

This one's less frequent and more manual, since it involves real infrastructure credentials:

1. Add the new Tech Lead to the Vercel project and the Supabase project as a team member.
2. Add them as a collaborator/member on the GitHub org repo (ideally with a role that lets them
   deploy).
3. Update the password-protected Drive doc with the new Tech Lead's access confirmed --- have
   them actually log into both dashboards once, don't assume it worked.
4. If the dedicated Tech Lead email/password itself needs to change hands (rather than just
   adding a new person to existing accounts), update the Drive doc and make sure the outgoing
   Tech Lead's personal devices/sessions are logged out.
5. Nothing needs to happen to the database connection string --- it stays in Vercel's environment
   variables regardless of who the Tech Lead is.

---

## 4. Backups

A simple scheduled backup still matters --- account handoffs are exactly when a "wait, who has
the latest backup?" gap can open up.

- A scheduled job (a GitHub Action in the repo works well) runs periodically, exports the
  database (`pg_dump`), and saves the result somewhere the club controls (e.g. a private location
  in the club Drive or a private repo).
- This runs automatically regardless of who's currently Tech Lead or TM Lead --- nobody has to
  remember to do it by hand.
- **Do this once, calmly:** practice restoring a backup into a throwaway local database, just so
  it's a known process rather than something improvised for the first time during an actual
  problem.

---

## 5. If something goes wrong

- **Can't log into Vercel/Supabase:** use the dedicated Tech Lead email's own account recovery.
- **Lost the Drive doc:** recoverable via the Tech Lead email --- not a real emergency, just
  update the doc afterward.
- **Database looks wrong or data is missing:** restore from the most recent scheduled backup
  (Section 4).
- **Not sure who's currently TM Lead / Administrator in the app:** check the Permission
  Management screen --- it always reflects the current state.
- **A pending TM Lead invite was sent to the wrong person:** cancel it from the Transfer Admin
  Role screen and send a new one.

---

## 6. Why it's built this way

- The database connection string never exists outside Vercel's own encrypted environment
  variables --- there's nothing to leak because there's nowhere else it's written.
- Infrastructure access (Tech Lead) and recruitment-process access (TM Lead) are handled through
  completely different mechanisms on purpose --- one is a small set of real credentials for one
  technical person, the other is an in-app role that rotates yearly and never needs to touch a
  password.
- The TM Lead handoff requires active acceptance from the incoming person, not a one-sided edit
  by the outgoing one --- so it can never leave the app with zero or two Administrators.

---

*Keep this file up to date, and reread it whenever either handoff happens --- it only works if
it matches reality.*
