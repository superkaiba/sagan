type EmailResult =
  | { status: 'sent' }
  | { status: 'missing_config' }
  | { status: 'failed'; error: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info('[email-missing-config]', {
      to: input.to,
      subject: input.subject,
    });
    return { status: 'missing_config' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const error = await res.text().catch(() => res.statusText);
      return { status: 'failed', error: error.slice(0, 500) };
    }
    return { status: 'sent' };
  } catch (err) {
    return {
      status: 'failed',
      error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    };
  }
}
