import { io } from 'socket.io-client';
import { getStoredToken } from './api';

let socket = null;

export function getSocket() {
  const token = getStoredToken();
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    return null;
  }

  if (!socket) {
    socket = io({
      auth: { token },
      autoConnect: true,
      reconnectionAttempts: 5,
    });

    socket.on('connect_error', (err) => {
      console.warn('[socket] connection error:', err.message);
    });
  }

  return socket;
}

export function subscribeToDivvy(divvyId, { onUpdated, onPresence, onDivvysChanged }) {
  const s = getSocket();
  if (!s || !divvyId) return () => {};

  s.emit('divvy:join', divvyId);

  const handleUpdated = (payload) => {
    if (payload?.divvy?.id === divvyId) {
      onUpdated?.(payload.divvy, payload);
    }
  };

  const handlePresence = (payload) => {
    if (payload?.divvyId === divvyId) {
      onPresence?.(payload.viewers || []);
    }
  };

  const handleDivvysChanged = (payload) => {
    onDivvysChanged?.(payload);
  };

  s.on('divvy:updated', handleUpdated);
  s.on('divvy:presence', handlePresence);
  s.on('divvys:changed', handleDivvysChanged);

  return () => {
    s.emit('divvy:leave', divvyId);
    s.off('divvy:updated', handleUpdated);
    s.off('divvy:presence', handlePresence);
    s.off('divvys:changed', handleDivvysChanged);
  };
}
