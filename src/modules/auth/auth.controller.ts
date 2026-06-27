import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';
import { ok } from '../../utils/http';

export async function requestOtp(req: Request, res: Response) {
  const { isNewUser } = await authService.requestOtp(req.body.phone, req.body.context);
  return ok(res, { isNewUser }, 'auth.otp_sent');
}

export async function verifyOtp(req: Request, res: Response) {
  const result = await authService.verifyOtp(req.body);
  return ok(
    res,
    {
      token: result.token,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      isNewUser: result.isNewUser,
    },
    result.isNewUser ? 'auth.signup_success' : 'auth.login_success'
  );
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
  return ok(res, await authService.refreshSession(refreshToken));
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
  await authService.logout(refreshToken);
  return ok(res, null);
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(req.user!.sub);
  return ok(res, { user });
}

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional(),
  language: z.enum(['en', 'hi']).optional(),
  preferred_store_ids: z.array(z.string().uuid()).max(50).optional(),
});

export async function updateMe(req: Request, res: Response) {
  const patch = updateMeSchema.parse(req.body);
  const user = await authService.updateMe(req.user!.sub, patch);
  return ok(res, { user });
}
