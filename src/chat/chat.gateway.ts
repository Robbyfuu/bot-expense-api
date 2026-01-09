/* eslint-disable */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { BotProcessorService } from '../bot/bot.processor';
import { Logger, UnauthorizedException } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  // Allow binary data reconstruction
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly botProcessor: BotProcessorService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      this.logger.debug(
        `Handshake Auth: ${JSON.stringify(client.handshake.auth)}`,
      );
      this.logger.debug(
        `Handshake Headers: ${JSON.stringify(client.handshake.headers)}`,
      );

      // Extract token from handshake.auth.token or headers.authorization
      let token =
        client.handshake.auth.token || client.handshake.headers.authorization;

      if (!token) {
        this.logger.warn(`No token found in handshake from ${client.id}`);
        throw new UnauthorizedException('No token provided');
      }

      // Strip "Bearer " prefix if present
      if (token.startsWith('Bearer ')) {
        token = token.substring(7);
      }

      this.logger.debug(`Verifying token: ${token.substring(0, 10)}...`);
      const payload = this.jwtService.verify(token);
      client.data.user = payload; // { sub: userId, phoneNumber: ... }
      this.logger.log(`Client connected: ${client.id} (User: ${payload.sub})`);

      // DEBUG: Log ALL events received from this client
      client.onAny((eventName, ...args) => {
        this.logger.debug(
          `🔔 Event received: "${eventName}" from ${client.id}`,
        );
        this.logger.debug(
          `   Args: ${JSON.stringify(args).substring(0, 200)}...`,
        );
      });
    } catch (e) {
      this.logger.warn(`Connection rejected: ${e.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { text: string },
  ) {
    await this.processTextMessage(client, data);
  }

  // Alias para compatibilidad con frontend que usa 'message-gpt'
  @SubscribeMessage('message-gpt')
  async handleMessageGPT(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { text: string },
  ) {
    this.logger.debug(
      `Received 'message-gpt' event, redirecting to processTextMessage`,
    );
    await this.processTextMessage(client, data);
  }

  private async processTextMessage(client: Socket, data: { text: string }) {
    const userId = client.data.user?.sub;
    if (!userId) {
      this.logger.warn('No userId for text message');
      return;
    }

    this.logger.log(`Processing text from ${userId}: ${data.text}`);

    try {
      const response = await this.botProcessor.processText(userId, data.text);
      this.logger.log(
        `Emitting response to ${client.id}: ${response.substring(0, 50)}...`,
      );
      client.emit('receiveMessage', { text: response, fromBot: true });
      this.logger.debug(`Response emitted successfully to ${client.id}`);
    } catch (e) {
      this.logger.error('Error processing text', e);
      client.emit('receiveMessage', {
        text: '❌ Error interno.',
        fromBot: true,
      });
    }
  }

  @SubscribeMessage('sendImage')
  async handleImage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      image?: string;
      buffer?: ArrayBuffer;
      filename?: string;
      mimetype?: string;
    },
  ) {
    const userId = client.data.user?.sub;
    if (!userId) {
      this.logger.warn('No userId in client data for sendImage');
      return;
    }

    this.logger.log(`Received web image from ${userId}`);
    this.logger.debug(`Data keys: ${Object.keys(data).join(', ')}`);
    this.logger.debug(
      `Data.buffer type: ${typeof data.buffer}, is Buffer: ${Buffer.isBuffer(data.buffer)}`,
    );
    this.logger.debug(
      `Data preview: ${JSON.stringify(data).substring(0, 300)}...`,
    );

    try {
      let buffer: Buffer;

      // Handle ArrayBuffer (binary data)
      if (data.buffer) {
        if (Buffer.isBuffer(data.buffer)) {
          this.logger.log('Processing Buffer (already converted by Socket.io)');
          buffer = data.buffer;
        } else if (data.buffer instanceof ArrayBuffer) {
          this.logger.log('Processing ArrayBuffer');
          buffer = Buffer.from(data.buffer);
        } else if (
          (data.buffer as any).type === 'Buffer' &&
          Array.isArray((data.buffer as any).data)
        ) {
          // Socket.io might send it as {type: 'Buffer', data: [...]}
          this.logger.log('Processing Buffer object notation');
          buffer = Buffer.from((data.buffer as any).data);
        } else {
          this.logger.error(
            `Unknown buffer format: ${JSON.stringify(data.buffer).substring(0, 200)}`,
          );
          throw new Error('Invalid buffer format received');
        }
        this.logger.debug(
          `Buffer size: ${buffer.length} bytes, mimetype: ${data.mimetype || 'unknown'}`,
        );
      }
      // Handle Base64 string (legacy support)
      else if (data.image) {
        this.logger.log('Processing Base64 image');
        const base64Data = data.image.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
        this.logger.debug(`Base64 converted to buffer: ${buffer.length} bytes`);
      }
      // No valid data
      else {
        throw new Error(
          'No image data provided (expected buffer or image field)',
        );
      }

      this.logger.log('Calling BotProcessor.processImage...');
      const response = await this.botProcessor.processImage(userId, buffer);
      this.logger.log(`BotProcessor returned: ${response.substring(0, 50)}...`);

      client.emit('receiveMessage', { text: response, fromBot: true });
      this.logger.log('Response emitted to client');
    } catch (e) {
      this.logger.error('Error processing image', e);
      client.emit('receiveMessage', {
        text: '❌ Error procesando imagen.',
        fromBot: true,
      });
    }
  }
}
