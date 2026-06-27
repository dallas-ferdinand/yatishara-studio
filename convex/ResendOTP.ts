import { Email } from "@convex-dev/auth/providers/Email";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { Resend as ResendAPI } from "resend";

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
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    if (!provider.apiKey) {
      throw new Error("Resend API key is not configured");
    }
    const resend = new ResendAPI(provider.apiKey);
    const from = process.env.AUTH_RESEND_FROM ?? "Yatishara Studio <noreply@yatishara.com>";
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: "Your Yatishara Studio sign-in code",
      text: `Your Yatishara Studio code is ${token}`,
    });
    if (error) {
      throw new Error("Could not send verification code");
    }
  },
});
