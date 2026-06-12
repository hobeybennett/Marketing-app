import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendOtpEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const normalised = email.toLowerCase().trim();

  // Rate-limit: one code per 60 seconds per email
  const recent = await prisma.otpToken.findFirst({
    where: {
      email: normalised,
      createdAt: { gt: new Date(Date.now() - 60_000) },
    },
  });
  if (recent) {
    return NextResponse.json({ error: 'Please wait a moment before requesting another code' }, { status: 429 });
  }

  // Clean up any old tokens for this email
  await prisma.otpToken.deleteMany({ where: { email: normalised } });

  // Generate 6-digit code
  const code = String(crypto.randomInt(100_000, 999_999));
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60_000);

  await prisma.otpToken.create({ data: { email: normalised, codeHash, expiresAt } });

  await sendOtpEmail(normalised, code);

  return NextResponse.json({ success: true });
}
