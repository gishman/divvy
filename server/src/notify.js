/**
 * Pluggable delivery of verification codes.
 *   SMS:   console | twilio
 *   Email: console | sendgrid | smtp
 * Twilio and SendGrid are called via their REST APIs (no SDK needed).
 */
import { config } from './config.js';

let smtpTransport;

async function sendSms(to, body) {
  if (config.smsProvider === 'twilio') {
    const { sid, token, from } = config.twilio;
    if (!sid || !token || !from) throw new Error('Twilio is not configured');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
    return;
  }
  console.log(`\n📱 [sms → ${to}] ${body}\n`);
}

async function sendEmail(to, subject, text) {
  if (config.emailProvider === 'sendgrid') {
    if (!config.sendgrid.apiKey) throw new Error('SendGrid is not configured');
    const fromMatch = config.emailFrom.match(/^(.*)<(.+)>$/);
    const from = fromMatch ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() } : { email: config.emailFrom };
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.sendgrid.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from,
        subject,
        content: [{ type: 'text/plain', value: text }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid error ${res.status}: ${await res.text()}`);
    return;
  }
  if (config.emailProvider === 'smtp') {
    if (!smtpTransport) {
      const nodemailer = await import('nodemailer');
      const { host, port, user, pass, secure } = config.smtp;
      smtpTransport = nodemailer.default.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
    }
    await smtpTransport.sendMail({ from: config.emailFrom, to, subject, text });
    return;
  }
  console.log(`\n✉️  [email → ${to}] ${subject}\n${text}\n`);
}

/** True when codes are only printed locally (we may echo them to the dev UI). */
export function isConsoleDelivery(channel) {
  return channel === 'sms' ? config.smsProvider === 'console' : config.emailProvider === 'console';
}

export async function sendVerificationCode(channel, destination, code) {
  const text = `Your divvy verification code is ${code}. It expires in 10 minutes.`;
  if (channel === 'sms') return sendSms(destination, text);
  return sendEmail(destination, `${code} is your divvy code`, `${text}\n\nIf you didn't request this, you can ignore this message.`);
}
