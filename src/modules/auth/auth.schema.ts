import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'auth.invalid_phone');

export const requestOtpSchema = z.object({
  phone,
  context: z.enum(['customer', 'member']).optional(),
});

export const verifyOtpSchema = z.object({
  phone,
  code: z.string().trim().min(4).max(8),
  // optional profile sent on first-time signup
  name: z.string().trim().min(1).max(120).optional(),
  language: z.enum(['en', 'hi']).optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
