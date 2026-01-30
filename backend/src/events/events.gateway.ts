import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../common/decorators/current-user.decorator.js';
import type { DocumentResponseDto } from '../documents/dto/document-response.dto.js';

/**
 * Map: userId -> Set of socket ids (one user can have multiple tabs)
 */
const userSockets = new Map<string, Set<string>>();

export interface DocumentUpdatedPayload {
  documentId: string;
  updates: { status?: string; progress?: number };
}

@WebSocketGateway({
  cors: { origin: true }, // align with frontend origin
  path: '/ws',
  transports: ['websocket', 'polling'],
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  afterInit() {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake?.auth as { token?: string } | undefined)?.token ??
      (typeof (client.handshake?.query as { token?: string } | undefined)?.token === 'string'
        ? (client.handshake.query as { token: string }).token
        : undefined);

    if (!token) {
      this.logger.warn(`Client ${client.id} connected without token`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      const userId = payload.sub;
      (client.data as { userId?: string }).userId = userId;

      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(client.id);
      this.logger.debug(`Client ${client.id} connected for user ${userId}`);
    } catch {
      this.logger.warn(`Client ${client.id} invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as { userId?: string }).userId;
    if (userId && userSockets.has(userId)) {
      userSockets.get(userId)!.delete(client.id);
      if (userSockets.get(userId)!.size === 0) {
        userSockets.delete(userId);
      }
    }
    this.logger.debug(`Client ${client.id} disconnected`);
  }

  emitDocumentCreated(userId: string, document: DocumentResponseDto): void {
    const socketIds = userSockets.get(userId);
    if (!socketIds?.size) return;
    socketIds.forEach((sid) => {
      this.server.to(sid).emit('document.created', { document });
    });
  }

  emitDocumentUpdated(userId: string, payload: DocumentUpdatedPayload): void {
    const socketIds = userSockets.get(userId);
    if (!socketIds?.size) return;
    socketIds.forEach((sid) => {
      this.server.to(sid).emit('document.updated', payload);
    });
  }

  emitDocumentDeleted(userId: string, documentId: string): void {
    const socketIds = userSockets.get(userId);
    if (!socketIds?.size) return;
    socketIds.forEach((sid) => {
      this.server.to(sid).emit('document.deleted', { documentId });
    });
  }
}
