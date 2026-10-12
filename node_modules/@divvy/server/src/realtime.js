/**
 * Real-time sync with Socket.IO.
 *   room `user:<contactId>`  — personal notifications (added to a divvy, list changes)
 *   room `divvy:<divvyId>`   — everyone currently viewing a divvy
 */
import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { assertAccess, getContact } from './repo.js';

let io;

export function initRealtime(httpServer, origins) {
  io = new Server(httpServer, { cors: { origin: origins, credentials: true } });

  io.use((socket, next) => {
    const id = verifyToken(socket.handshake.auth?.token);
    if (!id) return next(new Error('unauthorized'));
    socket.data.userId = id;
    next();
  });

  io.on('connection', async (socket) => {
    const { userId } = socket.data;
    const me = await getContact(userId).catch(() => null);
    socket.data.name = me?.name || 'Someone';
    socket.join(`user:${userId}`);

    socket.on('divvy:join', async (divvyId, ack) => {
      try {
        await assertAccess(divvyId, userId);
        for (const room of socket.rooms) if (room.startsWith('divvy:')) leave(socket, room);
        await socket.join(`divvy:${divvyId}`);
        await broadcastPresence(divvyId);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on('divvy:leave', (divvyId) => leave(socket, `divvy:${divvyId}`));

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('divvy:')) setTimeout(() => broadcastPresence(room.slice(6)), 50);
      }
    });
  });
  return io;
}

function leave(socket, room) {
  socket.leave(room);
  broadcastPresence(room.slice(6));
}

async function broadcastPresence(divvyId) {
  if (!io) return;
  const sockets = await io.in(`divvy:${divvyId}`).fetchSockets();
  const viewers = new Map();
  for (const s of sockets) viewers.set(s.data.userId, { contactId: s.data.userId, name: s.data.name });
  io.to(`divvy:${divvyId}`).emit('divvy:presence', { divvyId, viewers: [...viewers.values()] });
}

/** Push the latest divvy document to viewers and nudge every party's divvy list. */
export function emitDivvyUpdated(divvy, { actorId, reason } = {}) {
  if (!io) return;
  io.to(`divvy:${divvy.id}`).emit('divvy:updated', { divvy, actorId, reason });
  for (const p of divvy.parties) io.to(`user:${p.contactId}`).emit('divvys:changed', { divvyId: divvy.id });
}

export function emitToUser(contactId, event, payload) {
  io?.to(`user:${contactId}`).emit(event, payload);
}

export function emitDivvyDeleted(divvyId, partyContactIds) {
  if (!io) return;
  io.to(`divvy:${divvyId}`).emit('divvy:deleted', { divvyId });
  for (const id of partyContactIds) io.to(`user:${id}`).emit('divvys:changed', { divvyId });
}
