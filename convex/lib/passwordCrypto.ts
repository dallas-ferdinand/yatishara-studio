import { Scrypt } from "lucia";

const scrypt = new Scrypt();

export async function hashPassword(password: string): Promise<string> {
  return await scrypt.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await scrypt.verify(hash, password);
}

export const passwordProviderCrypto = {
  async hashSecret(password: string) {
    return await hashPassword(password);
  },
  async verifySecret(password: string, hash: string) {
    return await verifyPassword(password, hash);
  },
};
