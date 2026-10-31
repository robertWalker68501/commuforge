import { Resend } from 'resend';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import VerificationEmail from '@/emails/verification-email';

const resend = new Resend(process.env.RESEND_API_KEY);

type EmailProps = {
  to: string;
  verificationUrl: string;
  userName: string;
};

export const sendVerificationEmail = async ({
  to,
  verificationUrl,
  userName,
}: EmailProps) => {
  // Only suppress external email delivery in the isolated local E2E database.
  // The database check prevents accidentally enabling this behavior in development or production.
  if (process.env.COMMUFORGE_E2E === '1') {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('E2E email guard: DATABASE_URL is missing');
    const parsed = new URL(url);
    if (
      parsed.hostname !== '127.0.0.1' ||
      parsed.port !== '5434' ||
      parsed.pathname !== '/commuforge_test'
    ) {
      throw new Error('E2E email guard: refusing to bypass email delivery outside the test database');
    }
    // Local-only verification URL capture. The directory is ignored by Git.
    const captureDir = path.join(process.cwd(), 'test-results');
    await mkdir(captureDir, { recursive: true });
    await appendFile(
      path.join(captureDir, 'verification-emails.jsonl'),
      JSON.stringify({ email: to, url: verificationUrl }) + '\n',
      { mode: 0o600 }
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: 'Welcome to Commuforge',
    react: (
      <VerificationEmail
        verificationUrl={verificationUrl}
        userName={userName}
      />
    ),
  });

  if (error) {
    console.error('Verification email failed:', error);
    throw new Error('Failed to send verification email');
  }
};
