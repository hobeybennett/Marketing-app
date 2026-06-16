import { Resend } from 'resend';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.EMAIL_FROM ?? 'Promohit <noreply@promohit.com>';

export async function sendOtpEmail(email: string, code: string) {
  await getResend().emails.send({
    from: FROM(),
    to: email,
    subject: `${code} — your Promohit sign-in code`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px 24px;background:#07091a;color:#e8ebf8;border-radius:12px;">
        <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;">Your sign-in code</h1>
        <p style="color:#9ca3af;font-size:14px;margin:0 0 28px;">Enter this code on Promohit to continue. It expires in 15 minutes.</p>
        <div style="background:#1c2240;border:1px solid #2d3a60;border-radius:10px;padding:20px;text-align:center;margin-bottom:28px;">
          <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#a78bfa;">${code}</span>
        </div>
        <p style="color:#6b7280;font-size:12px;margin:0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}
