import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Central real-time gateway. Clients join role- and doctor-scoped rooms on
 * connect (based on their JWT) so broadcasts only reach relevant dashboards:
 *  - `role:receptionist` — every receptionist client (full queue visibility)
 *  - `doctor:<doctorId>` — a single doctor's own queue/patients only
 *
 * Feature services (QueueService, EtaService, BillsService) inject this
 * gateway and call the emit* helpers below rather than touching `io` directly.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private jwtService: JwtService) {}

  afterInit() {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.toString().replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Socket ${client.id} connected without token`);
        client.emit('auth:error', { message: 'No authentication token provided' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.user = payload;

      client.join(`role:${payload.role}`);
      if (payload.role === 'doctor') {
        client.join(`doctor:${payload.sub}`);
      }

      client.emit('auth:success', { role: payload.role });
      this.logger.log(`Client ${client.id} connected as ${payload.role} (${payload.email})`);
    } catch (err) {
      this.logger.warn(`Socket ${client.id} failed auth: ${(err as Error).message}`);
      client.emit('auth:error', { message: 'Invalid or expired token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ---- Emit helpers used by feature services ----

  /** Queue changed (check-in, status change, reorder, removal). */
  emitQueueUpdated(payload: { doctorId?: string | null; queue: unknown }) {
    this.server.to('role:receptionist').emit('queue:updated', payload);
    if (payload.doctorId) {
      this.server.to(`doctor:${payload.doctorId}`).emit('queue:updated', payload);
    }
  }

  /** A patient was called in for consultation. */
  emitPatientCalled(payload: { doctorId?: string | null; queueEntry: unknown }) {
    this.server.to('role:receptionist').emit('queue:patient-called', payload);
    if (payload.doctorId) {
      this.server.to(`doctor:${payload.doctorId}`).emit('queue:patient-called', payload);
    }
  }

  /** Live ETA recalculated for one or more waiting patients. */
  emitEtaUpdated(payload: { doctorId?: string | null; etas: unknown }) {
    this.server.to('role:receptionist').emit('eta:updated', payload);
    if (payload.doctorId) {
      this.server.to(`doctor:${payload.doctorId}`).emit('eta:updated', payload);
    }
  }

  /** Doctor clicked Next — "Now Calling Q-X Patient Name" banner for receptionist. */
  emitNowCalling(payload: { doctorId: string; doctorName: string; tokenNumber: number; patientName: string }) {
    this.server.to('role:receptionist').emit('queue:now-calling', payload);
  }

  /** A bill was created or its status changed. */
  emitBillUpdated(payload: { bill: unknown }) {
    this.server.to('role:receptionist').emit('bill:updated', payload);
  }
}
