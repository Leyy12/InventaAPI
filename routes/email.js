/**
 * email.js — Gmail email sender utility using googleapis (already installed).
 *
 * Setup (add to .env):
 *   GMAIL_CLIENT_ID=<your-oauth-client-id>
 *   GMAIL_CLIENT_SECRET=<your-oauth-client-secret>
 *   GMAIL_REFRESH_TOKEN=<your-refresh-token>
 *   GMAIL_SENDER_EMAIL=<your-gmail-address>
 *
 * To get credentials:
 *   1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client
 *   2. Use OAuth Playground (https://developers.google.com/oauthplayground)
 *      with scope: https://mail.google.com/
 *   3. Exchange auth code for refresh token and paste in .env
 */
import { google } from 'googleapis';

function getGmailClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    return null; // Email not configured; notifications will be in-app only
  }
  const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

function buildEmail({ to, subject, html }) {
  const sender = process.env.GMAIL_SENDER_EMAIL || 'noreply@inventaapi.com';
  const raw = [
    `From: InventaAPI <${sender}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

/**
 * Sends the Day-4 "3 days left" warning email.
 * @param {string} to - recipient email
 * @param {string} name - recipient display name
 * @param {number} daysLeft - days remaining (typically 3)
 * @param {string} upgradeUrl - direct link to Pro checkout
 */
export async function sendTrialExpiryWarning(to, name, daysLeft, upgradeUrl) {
  const gmail = getGmailClient();
  if (!gmail) {
    console.warn('[EMAIL] Gmail not configured. Skipping trial expiry warning email to', to);
    return;
  }

  const subject = `Your InventaAPI Free Trial expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0"
             style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;">InventaAPI</h1>
            <p style="margin:8px 0 0;font-size:13px;color:#c7d2fe;">Data-as-a-Service Platform</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="font-size:16px;color:#94a3b8;margin:0 0 8px;">Hello, ${name || 'there'}!</p>
            <h2 style="margin:0 0 16px;font-size:22px;color:#f1f5f9;">
              ⚠️ Your Free Trial is Expiring Soon
            </h2>
            <p style="color:#94a3b8;line-height:1.6;margin:0 0 24px;">
              Your 7-Day Free Trial will expire in <strong style="color:#f1f5f9;">${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.
              Once expired, your Free Trial API key will be automatically deactivated and API calls will return a
              <code style="background:#0f172a;padding:2px 6px;border-radius:4px;color:#818cf8;">401 Unauthorized</code> error.
            </p>
            <!-- Upgrade CTA -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
              <tr>
                <td align="center">
                  <a href="${upgradeUrl}"
                     style="display:inline-block;background:#6366f1;color:#fff;font-size:15px;font-weight:700;
                            text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                    Subscribe to Pro Plan →
                  </a>
                </td>
              </tr>
            </table>
            <!-- Benefits -->
            <table cellpadding="0" cellspacing="0" width="100%"
                   style="background:#0f172a;border-radius:8px;border:1px solid #334155;padding:20px;">
              <tr><td>
                <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;">
                  What you get with Pro
                </p>
                <p style="margin:0 0 8px;color:#94a3b8;font-size:14px;">✅ 5,000 API requests per day</p>
                <p style="margin:0 0 8px;color:#94a3b8;font-size:14px;">✅ No expiration date</p>
                <p style="margin:0 0 8px;color:#94a3b8;font-size:14px;">✅ Full product catalog access</p>
                <p style="margin:0;color:#94a3b8;font-size:14px;">✅ Priority API response times</p>
              </td></tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #334155;text-align:center;">
            <p style="margin:0;font-size:12px;color:#475569;">
              © ${new Date().getFullYear()} InventaAPI · You received this because you activated a Free Trial.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: buildEmail({ to, subject, html }) },
    });
    console.log(`[EMAIL] Trial expiry warning sent to ${to}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send trial expiry warning to ${to}:`, err.message);
  }
}

/**
 * Sends the Day-7 "Trial Expired" email.
 * @param {string} to - recipient email
 * @param {string} name - recipient display name
 * @param {string} upgradeUrl - direct link to Pro checkout
 */
export async function sendTrialExpiredEmail(to, name, upgradeUrl) {
  const gmail = getGmailClient();
  if (!gmail) {
    console.warn('[EMAIL] Gmail not configured. Skipping trial expired email to', to);
    return;
  }

  const subject = 'Your InventaAPI Free Trial has expired';
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0"
             style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;">InventaAPI</h1>
            <p style="margin:8px 0 0;font-size:13px;color:#c7d2fe;">Data-as-a-Service Platform</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="font-size:16px;color:#94a3b8;margin:0 0 8px;">Hello, ${name || 'there'}!</p>
            <h2 style="margin:0 0 16px;font-size:22px;color:#f1f5f9;">
              🔴 Your Free Trial Has Expired
            </h2>
            <p style="color:#94a3b8;line-height:1.6;margin:0 0 24px;">
              Your 7-Day Free Trial has ended. Your API key is now inactive and will return a
              <code style="background:#0f172a;padding:2px 6px;border-radius:4px;color:#f87171;">401 Unauthorized</code>
              error on any API call. Subscribe to the Pro Plan to reactivate your service and continue
              accessing the product catalog.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
              <tr>
                <td align="center">
                  <a href="${upgradeUrl}"
                     style="display:inline-block;background:#6366f1;color:#fff;font-size:15px;font-weight:700;
                            text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                    Reactivate with Pro Plan →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #334155;text-align:center;">
            <p style="margin:0;font-size:12px;color:#475569;">
              © ${new Date().getFullYear()} InventaAPI · You received this because your Free Trial has ended.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: buildEmail({ to, subject, html }) },
    });
    console.log(`[EMAIL] Trial expired email sent to ${to}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send trial expired email to ${to}:`, err.message);
  }
}
