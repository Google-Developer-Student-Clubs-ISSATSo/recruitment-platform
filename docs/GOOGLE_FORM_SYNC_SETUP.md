# Google Form → live applicant sync

Applications land in the platform as they're submitted, instead of waiting for
someone to export a CSV and upload it. The CSV import still exists and still
works — this is an addition, not a replacement, and both paths run the exact
same validation.

## How it fits together

```
Applicant submits the Google Form
        │
        ▼
Apps Script bound to the Form  (onFormSubmit trigger — Google's servers)
        │  POST + X-Webhook-Secret header
        ▼
/api/webhooks/applicant-submission  (this app)
        │
        ▼
Applicant row + PhaseOneResult, or a skipped duplicate
```

### Where the Apps Script actually lives

**On Google's side, bound to the Form — not in this app's deployment.**
`docs/google-apps-script/on-form-submit.gs` is a version-controlled *copy* for
review and history. Nothing in this repo's build reads, bundles, or deploys it.
Editing that file changes nothing until someone opens the Form's Apps Script
editor and pastes the new version in. If the sync is misbehaving, the running
code is whatever is in Google's editor — check there before trusting the repo.

### What the webhook does with a submission

Identical rules to a CSV import, because it is literally the same function
(`classifyApplicantRow` in `src/lib/applicant-intake.ts`):

- Missing name, missing/invalid email, an unrecognised answer to
  "Are you an ISSATSO student?", or an unrecognised committee → rejected with a
  reason, nothing created.
- Answered no to the ISSATSO question → created as `REJECTED_PHASE1` with no
  `PhaseOneResult` (the auto-reject rule; there is nothing to score).
- Otherwise → created as `SUBMITTED` with a `PhaseOneResult` of `PENDING`,
  ready for the scoring queue.
- Same email already in that campaign → skipped, reported as a success. Apps
  Script retries failed triggers, so a repeat delivery must be harmless.

### How answers are found (why Form edits usually don't break it)

Question titles are matched loosely: case, surrounding and repeated whitespace,
and a trailing colon are all ignored, and the committee question is matched on
its opening words only, so the P.S. appended to it can be reworded freely. The
committee answer is read from the abbreviation in it (`MKT`, `TM`, `EER`, as a
whole word), not from the full choice text — which is why the live Form's
"TM ( Team Managment )" typo is harmless. The ISSATSO answer is read from its
first word, so "Yes, I am" and a bare "Yes" both work.

The email is **not** matched by title on either path. The webhook takes it from
`getRespondentEmail()` — the collected address is a property of the submission,
never one of its item responses. The CSV import reads it from **column 1**, and
the timestamp from **column 0**, because Google generates those two columns in
the Form owner's account language: on the club's French account they export as
"Horodateur" and "Adresse e-mail". Their position is fixed whenever the Form
collects email addresses, so position is what intake relies on. If email
collection is ever turned off, both paths lose the address and every submission
becomes a "missing email" error row — that setting is load-bearing.

Every accepted submission writes an `APPLICANT_SUBMITTED_VIA_FORM` activity
entry ("received an application from the Google Form"), distinct from the
`APPLICANTS_IMPORTED` entry a manual CSV upload writes. The actor is the current
Administrator (TM Lead) — a webhook has no signed-in user, and the log requires a
real account — so the action type and the `source: google_form_webhook` detail
are what identify it as machine-originated. If no Administrator exists, the
applicant is still created and a `console.error` records the skipped log entry.

## Setting it up on a new Form or campaign

### 1. Server side — one environment variable

| Name | Where | Value |
| --- | --- | --- |
| `APPLICANT_WEBHOOK_SECRET` | Vercel → Project → Settings → Environment Variables (and your local `.env` for testing) | a long random string |

Generate a strong random value — **never** a guessable phrase, a campaign name,
or a reused password. Anyone holding this string can insert applicants into a
campaign. For example:

```bash
openssl rand -base64 48
# or
node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"
```

Redeploy after adding or changing it — Vercel only picks up env var changes on a
new deployment.

### 2. Google side — three Script Properties

Open the Form → ⋮ menu → **Apps Script**. Paste the contents of
`docs/google-apps-script/on-form-submit.gs` into the editor and save.

Then **Project Settings → Script Properties → Add script property**, three times:

| Property | Value |
| --- | --- |
| `WEBHOOK_URL` | `https://<your-deployed-domain>/api/webhooks/applicant-submission` |
| `WEBHOOK_SECRET` | the *same* string as `APPLICANT_WEBHOOK_SECRET` above |
| `CAMPAIGN_ID` | the `Campaign.id` this Form feeds |

The campaign must be **open**: submissions to a closed campaign are refused, so
closing a campaign also switches its Form sync off. `CAMPAIGN_ID` is required and
is never guessed by the server. The platform
deliberately allows several campaigns to be open at once, so "the open campaign"
is not a well-defined thing — a wrong guess would quietly contaminate a
campaign's applicant pool. Get the id from the campaign's URL in the app:
`/campaigns/<this-part>/dashboard`.

### 3. Install the trigger

In the Apps Script editor: **Triggers** (clock icon) → **Add Trigger**

- Function: `onFormSubmit`
- Event source: **From form**
- Event type: **On form submit**

Authorise it when Google prompts. Submit a test response to the Form and confirm
the applicant appears in the campaign; **Executions** in the Apps Script sidebar
shows a `[gdgc-sync] OK (201) …` line for a successful call.

### Moving to a new campaign next cycle

Update `CAMPAIGN_ID` in the Script Properties to the new campaign's id. If the
club also builds a brand-new Form, the script and all three properties have to be
set up again on that Form — properties belong to the script project, not to the
club account.

## Rotating the secret

Rotate it if it's ever pasted somewhere public, shared outside the core team, or
you simply want a fresh one between cycles. **The two values must match at all
times — change one and every submission silently fails with a 401.**

1. Generate a new random value.
2. Update `APPLICANT_WEBHOOK_SECRET` in Vercel and redeploy.
3. Immediately update `WEBHOOK_SECRET` in the Form's Script Properties.

Submissions made in the gap between steps 2 and 3 are **not** queued or retried
indefinitely — they're lost to the sync. Keep the window short, do it outside a
submission rush, and back-fill anything missed with a CSV import of the
responses sheet (duplicates are skipped, so re-importing the whole sheet is
safe).

## Troubleshooting

Check **Executions** in the Apps Script editor first — every failure logs there.

| Symptom | Cause |
| --- | --- |
| `401` | The two secrets don't match, or `APPLICANT_WEBHOOK_SECRET` isn't set on the server (it fails closed — an unset secret rejects everything, and logs a `console.error` server-side). |
| `400 Invalid request` | `CAMPAIGN_ID` is missing, or doesn't match a real campaign. |
| `400 This campaign is not currently accepting applications` | `CAMPAIGN_ID` points at a **closed** campaign. Either reopen it or point the property at the current one. |
| `400` with a `reason` | A genuinely malformed answer — the reason names the field. The same row would have failed a CSV import. |
| `429` | More than 60 submissions in a minute. Anything rejected can be back-filled with a CSV import. |
| `Missing Script Property: …` | The properties were never set, or were set on a different script project. |
| Nothing logged at all | The trigger isn't installed, or is installed on a different Form. |

Because duplicates are skipped rather than rejected, **a CSV import of the
responses sheet is always a safe repair** for anything the sync missed.
