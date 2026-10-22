import * as React from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

// The banner is referenced as ordinary hosted URLs served from public/,
// NOT as CID attachments. Nothing image-related travels inside the message, which
// is what keeps the delivered mail small and free of any attachment chip — a
// CID part is still an attachment as far as the client is concerned, however it
// is labelled.
//
// ⚠️ NEXT_PUBLIC_APP_URL must point at a real, publicly reachable origin for
// these to render in a delivered email: an ngrok tunnel while testing locally,
// the deployment URL in production. A localhost value silently fails for every
// recipient — their mail client (or Gmail's image proxy) fetches these from the
// public internet and cannot reach your machine. Nothing errors at send time;
// the images just come out blank.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

const BANNER_SRC = `${APP_URL}/banner.png`; // the blue-patterned GDGC banner graphic

// Club social links shown in the footer, laid out in two columns:
//   left  → Facebook, then LinkedIn
//   right → Youtube, then Twitter
// Each line is a bold "Label :" followed by a normal-weight, underlined,
// link-blue handle. These are the club's confirmed real accounts — the hrefs are
// the clean destination URLs, never wrapped in a tracker/redirect.
type Social = { label: string; handle: string; href: string };
const SOCIAL_LEFT: Social[] = [
  {
    label: "Facebook",
    handle: "/GDGC.ISSATSo",
    href: "https://www.facebook.com/gdgc.issatso",
  },
  {
    label: "LinkedIn",
    handle: "GDGC ISSATSo",
    href: "https://www.linkedin.com/company/gdsc-issatso/",
  },
];
const SOCIAL_RIGHT: Social[] = [
  {
    label: "Youtube",
    handle: "/GDGC.ISSATSo",
    href: "https://www.youtube.com/@googledeveloperstudentclub7820",
  },
  {
    label: "Twitter",
    handle: "@GDGC_ISSATSo",
    href: "https://x.com/gdsc_issatso",
  },
];

// Google Sans is the brand face, but it only renders for the minority of
// recipients whose device already has it installed system-wide (mainly
// Android/ChromeOS) — @font-face web fonts aren't reliably loadable in mail
// clients whatever the licensing, so there is no way to ship it. Everyone else
// falls through to Roboto, then Helvetica Neue/Arial, which are the closest
// widely-installed matches. Every text style in this file uses this one
// constant, so the stack can never drift between elements.
// Single quotes on purpose: React serialises the inline style attribute with
// double quotes, so a double-quoted family name becomes &quot; inside it, and some
// clients (Outlook, occasionally Gmail) drop the whole font-family declaration
// when they see that — the email then renders in the client's default font.
const FONT_STACK = "'Google Sans', Roboto, 'Helvetica Neue', Arial, sans-serif";

const PAGE_BACKGROUND = "#F3F3F3"; // same grey as the previous project's emails

// Horizontal inset of the body text inside the 600px card. The banner ignores
// this and always goes edge to edge.
const CONTENT_PAD = "20px";

// Outer wrapper: full width, NO padding. It used to carry 40px of padding, which
// stacked with the card's own 24px and squeezed the text into a narrow column on
// phones, and left grey/white gutters either side of the banner.
const main: React.CSSProperties = {
  backgroundColor: PAGE_BACKGROUND,
  fontFamily: FONT_STACK,
  color: "#000000",
  margin: 0,
  padding: 0,
};

// Inner container: the fixed-width content card. Capped at 600px, centred, and
// the only element carrying the #F3F3F2 background.
const container: React.CSSProperties = {
  backgroundColor: PAGE_BACKGROUND,
  // FIXED 600px (not 100% / max-width): this is what lets Gmail's phone app
  // scale the whole card down like a web page instead of reflowing the text.
  width: "600px",
  maxWidth: "600px",
  margin: "0 auto",
  padding: 0,
};

// `Container` renders as a <table align="center">, and that align attribute is
// inherited as text centering by several mail clients (Outlook's Word engine in
// particular) — which is what previously centred the whole body copy. Every text
// block therefore states its own alignment explicitly rather than relying on
// inheritance; this section re-establishes left as the default for the body.
const contentSection: React.CSSProperties = {
  padding: `24px ${CONTENT_PAD} 0px`,
  textAlign: "left",
};

// Edge to edge: NO horizontal padding, so the banner fills the whole card like
// the 11/4/2024 acceptance email. Only the text blocks below carry padding.
const bannerSection: React.CSSProperties = {
  padding: 0,
  margin: 0,
  lineHeight: 0,
  fontSize: 0,
};

const bannerImg: React.CSSProperties = {
  width: "100%",
  height: "auto",
  display: "block",
  border: "none",
  outline: "none",
  textDecoration: "none",
};

// With the footer logo gone, the social row is the last thing in the email, so
// it gets generous space above (the old layout had a big gap before it) and a
// comfortable bottom margin.
const socialSection: React.CSSProperties = {
  padding: `32px ${CONTENT_PAD} 32px`,
};

const socialColumn: React.CSSProperties = {
  width: "50%",
  verticalAlign: "top",
  textAlign: "center",
};

// One social row: bold "Label :" then a space then the underlined blue link.
const socialLine: React.CSSProperties = {
  fontFamily: FONT_STACK,
  fontSize: "13px",
  color: "#000000",
  lineHeight: "1.4",
  margin: "0 0 10px",
  whiteSpace: "nowrap",
};

const socialLabel: React.CSSProperties = {
  fontWeight: 400,
  color: "#000000",
};

// Normal weight (the label beside it is the bold part), standard link-blue,
// underlined. `Link` emits its own `text-decoration-line:none`, so the longhand
// has to be overridden by name — relying on the `text-decoration` shorthand
// winning on source order is not safe across mail clients.
const socialLinkStyle: React.CSSProperties = {
  fontWeight: 400,
  color: "#1155cc",
  textDecorationLine: "underline",
  textDecoration: "underline",
};

// Shared body-copy styles, so both templates render identically: plain black
// text in FONT_STACK, one paragraph per block with even 16px spacing between them.
// Bold/underline emphasis is applied inline in the templates with <strong>/<u>
// exactly where the source text has it.
//
// Every source paragraph gets its OWN <Text style={paragraph}> — the spacing
// below is what separates them, so never merge two source paragraphs into one
// block or join them with <br />.
export const paragraph: React.CSSProperties = {
  fontFamily: FONT_STACK,
  fontSize: "15px",
  fontWeight: 400,
  lineHeight: "1.35",
  color: "#000000",
  textAlign: "left",
  margin: "0 0 18px",
};

/**
 * An inline link inside body copy — bold, underlined, standard link blue, the
 * same blue the footer's social links use so every link in a message reads the
 * same way. As with `socialLinkStyle`, `Link` emits its own
 * `text-decoration-line:none`, so the longhand has to be overridden by name;
 * relying on the shorthand winning on source order is not safe across clients.
 */
export const bodyLink: React.CSSProperties = {
  fontWeight: 700,
  color: "#1155cc",
  textDecorationLine: "underline",
  textDecoration: "underline",
};

/** "Sincerely," — same left-aligned body copy, just with no bottom gap. */
export const signOff: React.CSSProperties = {
  ...paragraph,
  margin: "0 0 4px",
};

/**
 * An italic subheading inside the body copy — currently the acceptance email's
 * "What do you need to do next?". Bold as well as italic so it separates the
 * instructions below it from the prose above at a glance.
 */
export const subheading: React.CSSProperties = {
  ...paragraph,
  fontStyle: "italic",
  fontWeight: 700,
  margin: "20px 0 12px",
};

/** The team name: the one body line that stays centred, and is bold. */
export const teamName: React.CSSProperties = {
  ...paragraph,
  fontSize: "14px",
  fontWeight: 700,
  textAlign: "center",
  margin: "28px 0 10px 0",
};

/**
 * Shared shell for every outbound applicant email — the Phase 1 results, the
 * interview booking invite/reminder, and the final acceptance/rejection: a
 * white page holding a centred 600px #F3F3F2 card, left-aligned black body
 * copy, the GDGC banner (full width, edge to edge) and a two-column social
 * links row (Facebook/LinkedIn | Youtube/Twitter). The banner is a hosted URL,
 * not an attachment. Templates supply the body via `children`;
 * `preview` sets the inbox snippet.
 *
 * `bannerPosition` moves ONLY the banner: "bottom" (the default, matching the
 * old Phase 1 and interview emails) puts it under the body copy and team name;
 * "top" puts it above, as the old final accept/reject emails did. `justify`
 * justifies the body text, as the old final emails did; the rest were left-aligned. The social links stay below the content either way.
 */
export function BaseEmailLayout({
  preview,
  bannerPosition = "bottom",
  justify = false,
  children,
}: {
  preview: string;
  bannerPosition?: "top" | "bottom";
  justify?: boolean;
  children: React.ReactNode;
}) {
  // One element, rendered in one of two places — so the two positions can never
  // drift into using different markup or alt text.
  const banner = (
    <Section style={bannerSection}>
      <Img
        src={BANNER_SRC}
        alt="Google Developer Group On Campus - ISSATSo"
        style={bannerImg}
      />
    </Section>
  );

  return (
    <Html lang="en">
      <Head>
        {/* Deliberately NO viewport meta, NO color-scheme meta and NO @media
            queries. Gmail treats an email with none of those as a fixed-width
            "desktop" email: on a phone it shrinks the whole 600px card to fit
            the screen (the web-page feel), and in dark mode it inverts the colours
            automatically. Adding any of them switches that off. */}
        <style>{`
          /* Justify body paragraphs, but leave the centred team name alone. */
          .email-justify p:not([style*="center"]) { text-align: justify !important; }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {bannerPosition === "top" && banner}

          <Section
            style={contentSection}
            className={justify ? "email-justify" : undefined}
          >
            {children}
          </Section>

          {bannerPosition === "bottom" && banner}

          {/* Social links — two columns: Facebook/LinkedIn | Youtube/Twitter.
              Each line: bold "Label :" + normal-weight underlined blue link. */}
          <Section style={socialSection}>
            <Row>
              <Column style={socialColumn}>
                {SOCIAL_LEFT.map((s) => (
                  <Text key={s.label} style={socialLine}>
                    <span style={socialLabel}>{s.label} :</span>{" "}
                    <Link href={s.href} style={socialLinkStyle}>
                      {s.handle}
                    </Link>
                  </Text>
                ))}
              </Column>
              <Column style={socialColumn}>
                {SOCIAL_RIGHT.map((s) => (
                  <Text key={s.label} style={socialLine}>
                    <span style={socialLabel}>{s.label} :</span>{" "}
                    <Link href={s.href} style={socialLinkStyle}>
                      {s.handle}
                    </Link>
                  </Text>
                ))}
              </Column>
            </Row>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
