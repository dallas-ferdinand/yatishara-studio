/** Studio auth OTP email — matches the light auth sheet, not marketing brand mail. */

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Format a 6-digit OTP as `123-456` for email display. */
export function formatSignInCode(token: string): string {
  const digits = String(token).replace(/\D/g, "").slice(0, 6);
  if (digits.length === 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits || String(token);
}

export function buildSignInCodeEmail(opts: {
  code: string;
  email?: string;
  /** Public site origin for hosted brand assets (email clients need absolute URLs). */
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const pretty = formatSignInCode(opts.code);
  const subject = "Your Studio sign-in code";
  const text = [
    "Hey — here's your sign-in code for Yatishara Studio:",
    "",
    pretty,
    "",
    "It expires in about 15 minutes.",
    "If you didn't ask for this, you can ignore the email.",
  ].join("\n");

  const codeEsc = escapeHtml(pretty);
  const site = (opts.siteUrl || process.env.SITE_URL || "https://studio.yatishara.com").replace(
    /\/$/,
    "",
  );
  // PNG + dark ink for light auth sheet; absolute URL required in email.
  const logoUrl = `${site}/branding/yatishara-logo-dark-96.png`;
  const toLine = opts.email
    ? `We sent this to <span style="color:#1c1c1e;font-weight:600;">${escapeHtml(opts.email)}</span>.`
    : "Enter it on the sign-in screen to continue.";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f7;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Your Studio code is ${codeEsc}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:380px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="background:#ececf0;border:1px solid rgba(0,0,0,0.08);border-radius:28px;padding:28px 24px 26px;box-shadow:0 1px 2px rgba(15,23,42,0.04),0 18px 42px rgba(15,23,42,0.08);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 14px;">
                  <tr>
                    <td align="center">
                      <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:#ffffff;border:1px solid rgba(0,0,0,0.06);box-shadow:inset 0 1px 0 rgba(255,255,255,0.9),0 6px 16px rgba(15,23,42,0.06);line-height:56px;text-align:center;">
                        <img src="${escapeHtml(logoUrl)}" width="28" height="28" alt="Yatishara Studio" style="display:inline-block;width:28px;height:28px;vertical-align:middle;border:0;outline:none;" />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:650;letter-spacing:0.01em;color:#636366;">
                      Yatishara Studio
                    </td>
                  </tr>
                </table>
                <h1 style="margin:0 0 10px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:24px;line-height:1.15;letter-spacing:-0.03em;font-weight:700;color:#1c1c1e;">
                  Here’s your code
                </h1>
                <p style="margin:0 0 20px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:#636366;">
                  ${toLine}
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;">
                  <tr>
                    <td align="center" style="background:#ffffff;border:1px solid rgba(0,0,0,0.075);border-radius:22px;padding:20px 16px;">
                      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;line-height:1.2;letter-spacing:0.28em;font-weight:700;color:#1c1c1e;">
                        ${codeEsc}
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.45;color:#8e8e93;">
                  Good for about 15 minutes. Don’t share it.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.45;color:#8e8e93;">
                Didn’t try to sign in? Just ignore this.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
