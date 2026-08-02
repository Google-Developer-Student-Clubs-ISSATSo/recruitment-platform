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

var REQUIRED_PROPERTIES = ['WEBHOOK_URL', 'WEBHOOK_SECRET', 'CAMPAIGN_ID'];

/**
 * Form-submit trigger. Reads the submitted answers off the event object and
 * POSTs them to the platform.
 *
 * @param {Object} e Form submit event. Either shape works: `e.response` (a
 *     form-bound trigger) or `e.namedValues` (a sheet-bound one). Question
 *     titles are the same strings the CSV export uses as column headers, which
 *     is exactly what the webhook keys its lookups by.
 */
function onFormSubmit(e) {
  var config;
  try {
    config = readConfig_();
  } catch (err) {
    Logger.log('[gdgc-sync] Configuration error: ' + err.message);
    return;
  }

  var responses = readResponses_(e);
  if (!responses) {
    Logger.log(
      '[gdgc-sync] No submission data on the event object. Run this from a ' +
        'form-submit trigger, not from the editor.'
    );
    return;
  }

  postSubmission_(config, {
    campaignId: config.CAMPAIGN_ID,
    responses: responses,
  });
}

/**
 * Answers as a flat { question: answer } object, or null if the event carries
 * none.
 *
 * `e.response` is preferred because getItemResponses() comes back in form order,
 * which makes the payload deterministic and easy to read in the execution log;
 * `e.namedValues` (the sheet-bound trigger's shape) is an unordered map, so it
 * is only the fallback. Either is correct as far as the platform is concerned —
 * it looks answers up by question title, and the column they land in is jsonb,
 * which normalises key order anyway. Timestamp is included both ways: the CSV
 * export has that column, so the stored answers should too.
 */
function readResponses_(e) {
  if (!e) return null;

  if (e.response && typeof e.response.getItemResponses === 'function') {
    var responses = {};
    var submittedAt = e.response.getTimestamp();
    if (submittedAt) {
      responses['Timestamp'] = Utilities.formatDate(
        submittedAt,
        Session.getScriptTimeZone(),
        'yyyy-MM-dd HH:mm:ss'
      );
    }
    var items = e.response.getItemResponses();
    for (var i = 0; i < items.length; i++) {
      responses[items[i].getTitle()] = flattenAnswer_(items[i].getResponse());
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
      'Missing Script Propert' +
        (missing.length === 1 ? 'y' : 'ies') +
        ': ' +
        missing.join(', ') +
        '. Set them under Project Settings → Script Properties.'
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
  if (answer == null) return '';
  if (Array.isArray(answer)) {
    var parts = [];
    for (var i = 0; i < answer.length; i++) {
      parts.push(flattenAnswer_(answer[i]));
    }
    return parts.join(', ');
  }
  return String(answer);
}

/** Same collapsing, over the sheet-bound trigger's { question: [answers] } map. */
function flattenNamedValues_(namedValues) {
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
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Webhook-Secret': config.WEBHOOK_SECRET },
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
      '[gdgc-sync] Request failed for ' +
        describeSubmission_(payload) +
        ': ' +
        err.message
    );
    return;
  }

  var code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log(
      '[gdgc-sync] OK (' +
        code +
        ') for ' +
        describeSubmission_(payload) +
        ': ' +
        response.getContentText()
    );
    return;
  }

  Logger.log(
    '[gdgc-sync] Webhook returned ' +
      code +
      ' for ' +
      describeSubmission_(payload) +
      ': ' +
      response.getContentText()
  );
}

/** A short identifier for the log line — the applicant's email if we have it. */
function describeSubmission_(payload) {
  var email = payload.responses ? payload.responses['Email'] : '';
  return email ? 'submission from ' + email : 'an unidentified submission';
}
