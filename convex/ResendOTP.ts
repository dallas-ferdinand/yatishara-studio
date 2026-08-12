import { Email } from "@convex-dev/auth/providers/Email";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { Resend as ResendAPI } from "resend";
import { buildSignInCodeEmail } from "./lib/authEmail";

export const ResendOTP = Email({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY,
  maxAge: 60 * 15,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 6);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    if (!provider.apiKey) {
      throw new Error("Resend API key is not configured");
    }
    const resend = new ResendAPI(provider.apiKey);
    const from = process.env.AUTH_RESEND_FROM ?? "Yatishara Studio <hello@yatishara.com>";
    const message = buildSignInCodeEmail({
      code: token,
      email,
      siteUrl: process.env.SITE_URL,
    });
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (error) {
      throw new Error("Could not send verification code");
    }
  },
});
