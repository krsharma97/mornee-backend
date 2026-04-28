import axios from 'axios';
import nodemailer from 'nodemailer';
import pool from '../config/database.js';

const DEFAULT_PROVIDER = 'smtp';
const DEFAULT_COMPANY_NAME = 'Mornee';

export const getCompanyEmailSettings = async (client = pool) => {
  const result = await client.query('SELECT * FROM company_settings WHERE id = 1');
  return result.rows[0] || null;
};

export const buildEmailShell = ({ companyName = DEFAULT_COMPANY_NAME, body }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
    <div style="background: #4d2f8e; color: white; padding: 20px; text-align: center;">
      <h1 style="margin: 0;">${companyName}</h1>
    </div>
    <div style="padding: 30px;">${body}</div>
    <div style="background: #f8f3fb; padding: 20px; text-align: center; font-size: 12px; color: #8d738b;">
      <p style="margin: 0;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
`;

const normalizeEmailConfig = (settings = {}) => {
  const provider = String(settings.email_provider || DEFAULT_PROVIDER).trim().toLowerCase();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  const senderEmail = String(settings.smtp_user || settings.notification_email || settings.email || '').trim();
  const notificationEmail = String(settings.notification_email || settings.email || senderEmail).trim();

  return {
    provider,
    companyName,
    senderEmail,
    notificationEmail,
    smtpHost: String(settings.smtp_host || '').trim(),
    smtpPort: Number(settings.smtp_port || 587),
    smtpUser: String(settings.smtp_user || '').trim(),
    smtpPassword: String(settings.smtp_password || '').trim()
  };
};

const validateConfig = (config) => {
  if (config.provider === 'smtp') {
    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
      throw new Error('SMTP settings are incomplete.');
    }
    return;
  }

  if (config.provider === 'resend' || config.provider === 'sendgrid' || config.provider === 'brevo') {
    if (!config.smtpHost || !config.senderEmail) {
      throw new Error(`${config.provider} settings are incomplete.`);
    }
    return;
  }

  throw new Error(`Unsupported email provider: ${config.provider}`);
};

const sendViaSmtp = async (config, message) => {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: Number(config.smtpPort) === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword
    }
  });

  await transporter.sendMail({
    from: `"${config.companyName}" <${config.senderEmail || config.smtpUser}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text
  });
};

const sendViaResend = async (config, message) => {
  await axios.post(
    'https://api.resend.com/emails',
    {
      from: `${config.companyName} <${config.senderEmail}>`,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text
    },
    {
      headers: {
        Authorization: `Bearer ${config.smtpHost}`,
        'Content-Type': 'application/json'
      }
    }
  );
};

const sendViaSendGrid = async (config, message) => {
  await axios.post(
    'https://api.sendgrid.com/v3/mail/send',
    {
      personalizations: [
        {
          to: (Array.isArray(message.to) ? message.to : [message.to]).map((email) => ({ email }))
        }
      ],
      from: {
        email: config.senderEmail,
        name: config.companyName
      },
      subject: message.subject,
      content: [
        {
          type: 'text/html',
          value: message.html
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${config.smtpHost}`,
        'Content-Type': 'application/json'
      }
    }
  );
};

const sendViaBrevo = async (config, message) => {
  await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender: {
        email: config.senderEmail,
        name: config.companyName
      },
      to: (Array.isArray(message.to) ? message.to : [message.to]).map((email) => ({ email })),
      subject: message.subject,
      htmlContent: message.html
    },
    {
      headers: {
        'api-key': config.smtpHost,
        'Content-Type': 'application/json'
      }
    }
  );
};

export const sendEmailWithSettings = async (settings, message) => {
  const config = normalizeEmailConfig(settings);
  validateConfig(config);

  if (!message?.to) {
    throw new Error('Recipient email is required.');
  }

  const normalizedMessage = {
    ...message,
    text: message.text || ''
  };

  if (config.provider === 'smtp') {
    await sendViaSmtp(config, normalizedMessage);
    return { provider: config.provider };
  }

  if (config.provider === 'resend') {
    await sendViaResend(config, normalizedMessage);
    return { provider: config.provider };
  }

  if (config.provider === 'sendgrid') {
    await sendViaSendGrid(config, normalizedMessage);
    return { provider: config.provider };
  }

  if (config.provider === 'brevo') {
    await sendViaBrevo(config, normalizedMessage);
    return { provider: config.provider };
  }

  throw new Error(`Unsupported email provider: ${config.provider}`);
};

export const sendCompanyEmail = async ({ to, subject, html, text, settings }) => {
  const companySettings = settings || (await getCompanyEmailSettings());
  if (!companySettings) {
    throw new Error('Company email settings not found.');
  }

  return sendEmailWithSettings(companySettings, {
    to,
    subject,
    html,
    text
  });
};
