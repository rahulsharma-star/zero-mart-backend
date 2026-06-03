import { env } from '../config/env';

/**
 * SMS provider abstraction. Currently MSG91. Swap the implementation here
 * (or branch on a provider env var) to change providers without touching callers.
 */
export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

class Msg91Provider implements SmsProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    // Dev mode: never hit the network, just log the OTP.
    if (env.otp.devMode || !env.msg91.authKey) {
      // eslint-disable-next-line no-console
      console.log(`\n📱 [DEV OTP] phone=+91${phone}  code=${code}\n`);
      return;
    }

    // MSG91 OTP API (https://docs.msg91.com)
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('authkey', env.msg91.authKey);
    url.searchParams.set('template_id', env.msg91.templateId);
    url.searchParams.set('mobile', `91${phone}`);
    url.searchParams.set('otp', code);
    url.searchParams.set('sender', env.msg91.senderId);

    const res = await fetch(url.toString(), { method: 'POST' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MSG91 send failed (${res.status}): ${body}`);
    }
  }
}

export const sms: SmsProvider = new Msg91Provider();
