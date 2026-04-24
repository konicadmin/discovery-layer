import { z } from "zod";

export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "must be a ULID");

export const gstinSchema = z
  .string()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/, "invalid GSTIN");

export const phoneSchema = z
  .string()
  .regex(/^\+?[0-9]{8,15}$/, "invalid phone number");

export const emailSchema = z.string().email();
