import {
  Controller,
  Post,
  Get,
  Delete,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Public } from '../common/decorators/public.decorator.js';
import {
  ApiTokenGuard,
  type ApiTokenRequest,
} from '../api-tokens/api-token.guard.js';
import { McpToolsService } from './mcp-tools.service.js';

/**
 * MCP Streamable HTTP endpoint.
 *
 * Auth is SURGICAL: @Public() opts this controller out of the global JWT
 * guard (the guard's own @Public() mechanism — no path exclusions, no guard
 * changes), and ApiTokenGuard then enforces `Authorization: Bearer dm_...`
 * on every request. Every other route keeps global JWT deny-by-default.
 *
 * Stateless mode (sessionIdGenerator: undefined): a fresh Server + transport
 * per POST, per the SDK's stateless pattern — no session state to leak
 * between tokens. GET/DELETE (SSE streams / session teardown) are therefore
 * not supported and return 405.
 */
@Public()
@UseGuards(ApiTokenGuard)
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpTools: McpToolsService) {}

  @Post()
  async handle(
    @Req() req: ApiTokenRequest,
    @Res() res: Response,
  ): Promise<void> {
    if (!req.apiToken) {
      // Unreachable when the guard ran; keeps the type honest.
      throw new UnauthorizedException('Invalid API token');
    }
    const server = this.mcpTools.createServer(req.apiToken.userId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      // Nest/Express already parsed the JSON body; hand it to the SDK.
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      this.logger.error(
        '[mcp] transport error',
        err instanceof Error ? err.stack : String(err),
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  @Get()
  methodNotAllowedGet(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  @Delete()
  methodNotAllowedDelete(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. This MCP server is stateless: use POST.',
      },
      id: null,
    });
  }
}
