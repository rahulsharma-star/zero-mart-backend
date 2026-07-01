import http from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { verifyToken, JwtPayload, Role } from '../utils/jwt';
import * as chatSvc from '../modules/chat/chat.service';
import * as supportSvc from '../modules/support-chat/support-chat.service';

let io: Server | null = null;

export function getIo(): Server | null {
  return io;
}

export function initSocket(httpServer: http.Server): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      String(socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return next(new Error('unauthorized'));
    try {
      socket.data.user = verifyToken(token) as JwtPayload;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as JwtPayload;
    socket.join(`user:${user.sub}`);

    socket.on('chat:join', async (payload: { chatId?: string }, ack?: (r: { ok: boolean; error?: string }) => void) => {
      try {
        const chatId = payload?.chatId;
        if (!chatId) throw new Error('chat.invalid');
        await chatSvc.assertChatAccess(chatId, user.sub, user.role as Role);
        socket.join(`chat:${chatId}`);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('chat:leave', (payload: { chatId?: string }) => {
      if (payload?.chatId) socket.leave(`chat:${payload.chatId}`);
    });

    socket.on(
      'chat:send',
      async (
        payload: { chatId?: string; body?: string; message_type?: 'text' | 'voice'; audio_url?: string },
        ack?: (r: { ok: boolean; message?: unknown; error?: string }) => void
      ) => {
        try {
          const chatId = payload?.chatId;
          if (!chatId) throw new Error('chat.invalid');
          const msg = await chatSvc.sendMessage(chatId, user.sub, user.role as Role, {
            body: payload.body,
            message_type: payload.message_type,
            audio_url: payload.audio_url,
          });
          io!.to(`chat:${chatId}`).emit('chat:new_message', { chatId, message: msg });
          ack?.({ ok: true, message: msg });
        } catch (e) {
          ack?.({ ok: false, error: (e as Error).message });
        }
      }
    );

    socket.on('support:join', async (payload: { chatId?: string }, ack?: (r: { ok: boolean; error?: string }) => void) => {
      try {
        const chatId = payload?.chatId;
        if (!chatId) throw new Error('chat.invalid');
        await supportSvc.assertSupportChatAccess(chatId, user.sub, user.role as Role);
        socket.join(`support:${chatId}`);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('support:leave', (payload: { chatId?: string }) => {
      if (payload?.chatId) socket.leave(`support:${payload.chatId}`);
    });

    socket.on(
      'support:send',
      async (
        payload: { chatId?: string; body?: string; message_type?: 'text' | 'voice'; audio_url?: string },
        ack?: (r: { ok: boolean; message?: unknown; error?: string }) => void
      ) => {
        try {
          const chatId = payload?.chatId;
          if (!chatId) throw new Error('chat.invalid');
          const msg = await supportSvc.sendMessage(chatId, user.sub, user.role as Role, {
            body: payload.body,
            message_type: payload.message_type,
            audio_url: payload.audio_url,
          });
          io!.to(`support:${chatId}`).emit('support:new_message', { chatId, message: msg });
          ack?.({ ok: true, message: msg });
        } catch (e) {
          ack?.({ ok: false, error: (e as Error).message });
        }
      }
    );

    socket.on('disconnect', () => {
      /* rooms cleaned automatically */
    });
  });

  return io;
}
