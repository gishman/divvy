const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/divvy',
  clientOrigins: (env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  jwtSecret: env.JWT_SECRET || 'dev-only-change-me',
  isProd: env.NODE_ENV === 'production',
  smsProvider: env.SMS_PROVIDER || 'console',
  emailProvider: env.EMAIL_PROVIDER || 'console',
  twilio: { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM },
  sendgrid: { apiKey: env.SENDGRID_API_KEY },
  emailFrom: env.EMAIL_FROM || 'divvy <no-reply@divvy.local>',
  smtp: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    secure: env.SMTP_SECURE === 'true',
  },
  paypal: {
    mode: env.PAYPAL_MODE || 'sandbox',
    clientId: env.PAYPAL_CLIENT_ID || '',
    clientSecret: env.PAYPAL_CLIENT_SECRET || '',
  },
};

if (config.isProd && config.jwtSecret === 'dev-only-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
