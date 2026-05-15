/**
 * WebSocket server — real-time job updates to connected clients.
 * Attaches to the existing HTTP server.
 * @module api/ws
 */

import { WebSocketServer } from 'ws';
import { subscribe } from './jobs.js';

/**
 * Attach WebSocket server to an HTTP server.
 * @param {import('node:http').Server} server
 */
export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');

    // Subscribe this client to job broadcasts
    const unsubscribe = subscribe((msg) => {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    });

    ws.on('message', (data) => {
      // Future: handle client commands (cancel job, etc.)
      try {
        const msg = JSON.parse(data);
        console.log('[WS] Received:', msg.type);
      } catch {}
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      unsubscribe();
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connected' }));
  });

  return wss;
}
