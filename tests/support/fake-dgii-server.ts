/**
 * Fake DGII server for end-to-end tests. Mimics the small subset of the
 * DGII e-CF endpoints that the app calls:
 *   POST   /api/auth                        -> { token, expiration }
 *   POST   /api/Ecf/Recepcion              -> { trackId, estado: 'En proceso' }
 *   GET    /api/Ecf/Estado/:trackId        -> first poll: 'En proceso',
 *                                              subsequent polls: 'Aceptado'
 *   POST   /__control/track/:trackId       -> {estado} test override
 *
 * All state is in-memory.
 */
import * as http from 'http';
import { randomUUID } from 'crypto';

interface TrackState {
  estado: string;
  pollCount: number;
  override?: string;
}

const trackStore = new Map<string, TrackState>();
let server: http.Server | null = null;
let url = '';

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, body: any) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(data);
}

async function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  const u = req.url || '';
  const method = req.method || 'GET';

  try {
    if (method === 'POST' && u === '/api/auth') {
      await readBody(req);
      const token = 'test-token-' + Date.now();
      const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      return send(res, 200, { token, expiration });
    }

    if (method === 'POST' && u === '/api/Ecf/Recepcion') {
      await readBody(req);
      const trackId = 'TRK-' + randomUUID();
      trackStore.set(trackId, { estado: 'En proceso', pollCount: 0 });
      return send(res, 200, { trackId, estado: 'En proceso' });
    }

    const estadoMatch = u.match(/^\/api\/Ecf\/Estado\/([^/?]+)/);
    if (method === 'GET' && estadoMatch) {
      const trackId = estadoMatch[1];
      const state = trackStore.get(trackId);
      if (!state) return send(res, 404, { error: 'TrackId not found' });

      if (state.override) {
        return send(res, 200, {
          trackId,
          estado: state.override,
          codigoSeguridad: state.override === 'Aceptado' ? 'ABC123' : undefined,
        });
      }

      state.pollCount += 1;
      // First poll => 'En proceso', subsequent => 'Aceptado'
      if (state.pollCount <= 1) {
        return send(res, 200, { trackId, estado: 'En proceso' });
      }
      return send(res, 200, {
        trackId,
        estado: 'Aceptado',
        codigoSeguridad: 'ABC123',
      });
    }

    const ctrlMatch = u.match(/^\/__control\/track\/([^/?]+)/);
    if (method === 'POST' && ctrlMatch) {
      const trackId = ctrlMatch[1];
      const body = await readBody(req);
      let parsed: any = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        return send(res, 400, { error: 'Invalid JSON' });
      }
      const state = trackStore.get(trackId) || { estado: 'En proceso', pollCount: 0 };
      state.override = parsed.estado;
      trackStore.set(trackId, state);
      return send(res, 200, { trackId, estado: state.override });
    }

    return send(res, 404, { error: 'Not found', url: u });
  } catch (err) {
    return send(res, 500, { error: String(err) });
  }
}

export async function startFakeDGII(port?: number): Promise<string> {
  const p = port || parseInt(process.env.TEST_FAKE_DGII_PORT || '8787', 10);
  if (server) {
    return url;
  }
  server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(p, '127.0.0.1', () => resolve());
  });
  url = `http://127.0.0.1:${p}`;
  return url;
}

export async function stopFakeDGII(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
  url = '';
  trackStore.clear();
}

export function controlTrack(trackId: string, estado: string): void {
  const state = trackStore.get(trackId) || { estado: 'En proceso', pollCount: 0 };
  state.override = estado;
  trackStore.set(trackId, state);
}

export function getFakeDGIIUrl(): string {
  return url;
}
