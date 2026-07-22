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

// Both footer images are referenced as ordinary hosted URLs served from public/,
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
const FOOTER_LOGO_SRC = `${APP_URL}/logo-kamel.png`; // at the very bottom

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
    href: "https://www.facebook.com/gdgoc.issatso",
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
const FONT_STACK = '"Google Sans", Roboto, "Helvetica Neue", Arial, sans-serif';

const PAGE_BACKGROUND = "#F3F3F2";

// Outer wrapper: full width, plain white. Deliberately NOT the page background —
// keeping it white is what leaves visible margins either side of the card below
// instead of letting the grey stretch edge-to-edge across the whole window.
const main: React.CSSProperties = {
  backgroundColor: "#ffffff",
  fontFamily: FONT_STACK,
  color: "#000000",
  margin: 0,
  padding: "24px 0",
};

// Inner container: the fixed-width content card. Capped at 600px, centred, and
// the only element carrying the #F3F3F2 background.
const container: React.CSSProperties = {
  backgroundColor: PAGE_BACKGROUND,
  maxWidth: "600px",
  margin: "0 auto",
};

// `Container` renders as a <table align="center">, and that align attribute is
// inherited as text centering by several mail clients (Outlook's Word engine in
// particular) — which is what previously centred the whole body copy. Every text
// block therefore states its own alignment explicitly rather than relying on
// inheritance; this section re-establishes left as the default for the body.
const contentSection: React.CSSProperties = {
  padding: "24px 24px 0px",
  textAlign: "left",
};

const bannerSection: React.CSSProperties = {
  padding: "0px 24px",
  margin: 0,
  lineHeight: 0,
};

const bannerImg: React.CSSProperties = {
  width: "100%",
  height: "auto",
  display: "block",
  border: "none",
  outline: "none",
  textDecoration: "none",
};

const socialSection: React.CSSProperties = {
  padding: "16px 24px",
};

const socialColumn: React.CSSProperties = {
  width: "50%",
  verticalAlign: "top",
  textAlign: "center",
};

// One social row: bold "Label :" then a space then the underlined blue link.
const socialLine: React.CSSProperties = {
  fontFamily: FONT_STACK,
  fontSize: "14px",
  color: "#000000",
  lineHeight: "1.4",
  margin: "0 0 8px",
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

const footerLogoSection: React.CSSProperties = {
  padding: "8px 24px 24px",
  textAlign: "center",
};

const footerLogoImg: React.CSSProperties = {
  // Roughly double the previous 240px, so the sign-off logo reads clearly.
  width: "480px",
  maxWidth: "100%",
  height: "auto",
  margin: "0 auto",
  display: "block",
  border: "none",
  outline: "none",
  textDecoration: "none",
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
  fontSize: "18px",
  fontWeight: 400,
  lineHeight: "1.1",
  color: "#000000",
  textAlign: "left",
  margin: "0 0 16px",
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
  fontSize: "12px",
  fontWeight: 700,
  textAlign: "center",
  marginTop: "10px",
};

/**
 * Shared shell for every outbound applicant email — the Phase 1 results, the
 * interview booking invite/reminder, and the final acceptance/rejection: a
 * white page holding a centred 600px #F3F3F2 card, left-aligned black body
 * copy, the GDGC banner, a two-column social links row (Facebook/LinkedIn |
 * Youtube/Twitter), and the logo-kamel graphic at the very bottom. Both images
 * are hosted URLs, not attachments. Templates supply the body via `children`;
 * `preview` sets the inbox snippet.
 *
 * `bannerPosition` moves ONLY the banner: "bottom" (the default, so the Phase 1
 * and interview templates keep rendering exactly as they always have) puts it
 * under the body copy; "top" puts it above, which is what the final-decision
 * emails use. The social links and the logo stay below the content either way —
 * the footer order never changes.
 */
export function BaseEmailLayout({
  preview,
  bannerPosition = "bottom",
  children,
}: {
  preview: string;
  bannerPosition?: "top" | "bottom";
  children: React.ReactNode;
}) {
  // One element, rendered in one of two places — so the two positions can never
  // drift into using different markup or alt text.
  const banner = (
    <Section style={bannerSection}>
      <Img
        src={BANNER_SRC}
        alt="Google Developer Groups On Campus - ISSATSo"
        style={bannerImg}
      />
    </Section>
  );

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {bannerPosition === "top" && banner}

          <Section style={contentSection}>{children}</Section>

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

          {/* logo-kamel.png at the very bottom */}
          <Section style={footerLogoSection}>
            <Img
              src={FOOTER_LOGO_SRC}
              alt="Google Developer Group — GDG on Campus ISSATSo"
              style={footerLogoImg}
            />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
