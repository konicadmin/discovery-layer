/**
 * Dev/test OTP store. Replace with a real provider (MSG91, Twilio, etc.) in
 * production by implementing the same OtpStore interface.
 */
import { randomInt } from "node:crypto";

export interface OtpStore {
  request(target: string): Promise<{ code: string; expiresAt: Date }>;
  verify(target: string, code: string): Promise<boolean>;
}

type Pending = { code: string; expiresAt: Date };

const store = new Map<string, Pending>();
const TTL_MS = 5 * 60 * 1000;

export const inMemoryOtp: OtpStore = {
  async request(target) {
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + TTL_MS);
    store.set(target, { code, expiresAt });
    return { code, expiresAt };
  },
  async verify(target, code) {
    const entry = store.get(target);
    if (!entry) return false;
    if (entry.expiresAt.getTime() < Date.now()) {
      store.delete(target);
      return false;
    }
    if (entry.code !== code) return false;
    store.delete(target);
    return true;
  },
};
