import nodemailer from "nodemailer";

let transporter;

export async function sendReminderEmail({ to, taskTitle, scheduledAt, timezone, fetchImpl = fetch }) {
  const from = process.env.REMINDER_FROM_EMAIL;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !from || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error("Email delivery is not configured."), { code: "EMAIL_NOT_CONFIGURED" });
  }
  const when = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(scheduledAt);
  transporter ??= nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter.sendMail({
    from,
    to,
    subject: `Task reminder: ${taskTitle}`,
    text: `Reminder: ${taskTitle}\n\nYour reminder was scheduled for ${when} (${timezone}).`,
  });
}
