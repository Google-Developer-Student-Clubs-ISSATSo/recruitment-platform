/**
 * GDGC Recruitment Platform — Google Form → live applicant sync.
 *
 * THIS FILE IS NOT PART OF THE DEPLOYED APP. It lives here for version control
 * and review only. The code that actually runs is a copy of this file pasted
 * into the Apps Script project bound to the recruitment Google Form, on
 * Google's side. Editing this file changes nothing until someone re-pastes it.
 * Setup instructions: docs/GOOGLE_FORM_SYNC_SETUP.md
 *
 * Trigger: Form submit (installable) → onFormSubmit.
 *
 * Configuration comes from Script Properties, never from this file — the shared
 * secret must not live in the repository:
 *   WEBHOOK_URL    https://<your-domain>/api/webhooks/applicant-submission
 *   WEBHOOK_SECRET the same value as APPLICANT_WEBHOOK_SECRET on the server
 *   CAMPAIGN_ID    the Campaign this Form feeds (required; never inferred)
 */

var REQUIRED_PROPERTIES = ["WEBHOOK_URL", "WEBHOOK_SECRET", "CAMPAIGN_ID"];

/**
 * Form-submit trigger. Reads the submitted answers off the event object and
 * POSTs them to the platform.
 *
 * @param {Object} e Form submit event. Either shape works: `e.response` (a
 *     form-bound trigger) or `e.namedValues` (a sheet-bound one). Answers are
 *     keyed by question title; the platform matches those titles loosely
 *     (case, spacing and a trailing colon are ignored, and the committee
 *     question is matched on its opening words), so ordinary edits to the
 *     Form's wording do not break intake.
 */
function onFormSubmit(e) {
  var config;
  try {
    config = readConfig_();
  } catch (err) {
    Logger.log("[gdgc-sync] Configuration error: " + err.message);
    return;
  }

  var responses = readResponses_(e);
  if (!responses) {
    Logger.log(
      "[gdgc-sync] No submission data on the event object. Run this from a " +
        "form-submit trigger, not from the editor.",
    );
    return;
  }

  Logger.log("[gdgc-sync] Captured responses: " + JSON.stringify(responses));

  postSubmission_(config, {
    campaignId: config.CAMPAIGN_ID,
    responses: responses,
  });
}

/**
 * Answers as a flat { question: answer } object, or null if the event carries
 * none.
 *
 * `e.response` — the form-submit trigger's shape, and the only supported setup
 * — is the real path: getItemResponses() comes back in form order, which makes
 * the payload deterministic and easy to read in the execution log, and the
 * respondent's email can be asked for directly.
 *
 * `e.namedValues` (the sheet-submit trigger's shape) is an unordered map kept
 * only so a misconfigured trigger degrades visibly rather than silently. It
 * cannot carry the email; see flattenNamedValues_, which says so in the log.
 *
 * Key order does not matter either way: the platform looks answers up by
 * question title, and the column they land in is jsonb, which normalises order.
 * Timestamp is included both ways, since the CSV export has that column too.
 */
function readResponses_(e) {
  if (!e) return null;

  if (e.response && typeof e.response.getItemResponses === "function") {
    var responses = {};
    var submittedAt = e.response.getTimestamp();
    if (submittedAt) {
      responses["Timestamp"] = Utilities.formatDate(
        submittedAt,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd HH:mm:ss",
      );
    }
    // The collected email is not an item response — it is a property of the
    // submission, so it never appears in getItemResponses(). Keyed as "Email"
    // because that is what the platform looks the address up under; the CSV
    // export's own column for it is named in the Form owner's account language
    // ("Adresse e-mail" on the club's French account) and is read by position
    // there instead. Guarded because the method only exists when the Form
    // collects emails.
    if (e.response.getRespondentEmail) {
      var respondentEmail = e.response.getRespondentEmail();
      if (respondentEmail) {
        responses["Email"] = respondentEmail;
      }
    }
    var items = e.response.getItemResponses();
    for (var i = 0; i < items.length; i++) {
      responses[items[i].getItem().getTitle()] = flattenAnswer_(
        items[i].getResponse(),
      );
    }
    return responses;
  }

  if (e.namedValues) return flattenNamedValues_(e.namedValues);

  return null;
}

/** Reads and validates the Script Properties. Throws if any are missing. */
function readConfig_() {
  var props = PropertiesService.getScriptProperties();
  var config = {};
  var missing = [];

  for (var i = 0; i < REQUIRED_PROPERTIES.length; i++) {
    var key = REQUIRED_PROPERTIES[i];
    var value = props.getProperty(key);
    if (!value) {
      missing.push(key);
    } else {
      config[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      "Missing Script Propert" +
        (missing.length === 1 ? "y" : "ies") +
        ": " +
        missing.join(", ") +
        ". Set them under Project Settings → Script Properties.",
    );
  }
  return config;
}

/**
 * One answer as the single string the platform stores. A checkbox question (or
 * a grid) answers with an array, joined with ", " the way the spreadsheet
 * export writes it into one cell.
 */
function flattenAnswer_(answer) {
  if (answer == null) return "";
  if (Array.isArray(answer)) {
    var parts = [];
    for (var i = 0; i < answer.length; i++) {
      parts.push(flattenAnswer_(answer[i]));
    }
    return parts.join(", ");
  }
  return String(answer);
}

/**
 * Same collapsing, over the sheet-bound trigger's { question: [answers] } map.
 *
 * This path CANNOT supply the applicant's email. A sheet-submit event carries
 * only spreadsheet columns, and the collected address lands in one Google names
 * in the Form owner's account language ("Adresse e-mail" on the club's French
 * account) — a key the platform does not match on, since it reads that column
 * by position out of a CSV and has no positions here. There is no respondent on
 * a sheet event to ask, the way the form-bound branch asks
 * getRespondentEmail(). So it warns loudly on the way past: downstream this
 * surfaces as a bare "missing email" rejection, which says nothing about the
 * trigger being the wrong type. Nothing is dropped here — the submission is
 * still posted, so the server's own rejection stays the record of what happened.
 */
function flattenNamedValues_(namedValues) {
  Logger.log(
    "[gdgc-sync] WARNING: this ran from a spreadsheet-submit trigger, which " +
      "cannot supply the applicant's email — the platform will reject this " +
      "submission as 'missing email'. Delete this trigger and create a Form-" +
      "submit trigger on the Form instead (Apps Script → Triggers → event " +
      "type 'On form submit'); see docs/GOOGLE_FORM_SYNC_SETUP.md.",
  );

  var responses = {};
  for (var question in namedValues) {
    if (!Object.prototype.hasOwnProperty.call(namedValues, question)) continue;
    responses[question] = flattenAnswer_(namedValues[question]);
  }
  return responses;
}

/**
 * POSTs one submission. Failures are logged, not thrown: a thrown error here
 * would only surface as a failed-trigger email, and the platform treats a
 * repeat of the same submission as a safe no-op, so a manual re-run after
 * fixing the cause is always allowed.
 */
function postSubmission_(config, payload) {
  var options = {
    method: "post",
    contentType: "application/json",
    headers: { "X-Webhook-Secret": config.WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
    // Handle non-2xx ourselves instead of letting UrlFetchApp throw, so the log
    // line can carry the server's actual explanation.
    muteHttpExceptions: true,
  };

  var response;
  try {
    response = UrlFetchApp.fetch(config.WEBHOOK_URL, options);
  } catch (err) {
    Logger.log(
      "[gdgc-sync] Request failed for " +
        describeSubmission_(payload) +
        ": " +
        err.message,
    );
    return;
  }

  var code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log(
      "[gdgc-sync] OK (" +
        code +
        ") for " +
        describeSubmission_(payload) +
        ": " +
        response.getContentText(),
    );
    return;
  }

  Logger.log(
    "[gdgc-sync] Webhook returned " +
      code +
      " for " +
      describeSubmission_(payload) +
      ": " +
      response.getContentText(),
  );
}

/** A short identifier for the log line — the applicant's email if we have it. */
function describeSubmission_(payload) {
  var email = payload.responses ? payload.responses["Email"] : "";
  return email ? "submission from " + email : "an unidentified submission";
}
