import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { retrieveAccount } from "@convex-dev/auth/server";
import { passwordProviderCrypto } from "./lib/passwordCrypto";

export const PHONE_PASSWORD_PROVIDER = "phone-password";

export const PhonePassword = ConvexCredentials({
  id: PHONE_PASSWORD_PROVIDER,
  crypto: passwordProviderCrypto,
  authorize: async (credentials, ctx) => {
    const phone =
      typeof credentials.phone === "string" ? normalizePhone(credentials.phone) : null;
    const password = credentials.password;
    if (!phone || typeof password !== "string" || password.length === 0) {
      return null;
    }

    try {
      const retrieved = await retrieveAccount(ctx, {
        provider: PHONE_PASSWORD_PROVIDER,
        account: { id: phone, secret: password },
      });
      return { userId: retrieved.user._id };
    } catch {
      return null;
    }
  },
});

export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }
  return digits;
}
