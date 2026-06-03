import { createApp } from './app';
import { env } from './config/env';
import { pingDb } from './config/db';
import { processOutbox } from './modules/notifications/notifications.service';

async function main() {
  try {
    await pingDb();
    // eslint-disable-next-line no-console
    console.log('✓ Database connected');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('✗ Database connection failed:', (err as Error).message);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 Zero API running on http://localhost:${env.port}${env.apiPrefix}`);
    if (env.otp.devMode) console.log('🔓 OTP dev mode ON — codes are printed to this console.');
  });

  // Drain the notification outbox periodically (MVP: in-process; use a queue/worker at scale).
  setInterval(() => {
    processOutbox().catch((e) => console.error('[outbox]', (e as Error).message));
  }, 5000);
}

main();
