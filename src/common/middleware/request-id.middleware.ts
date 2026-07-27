import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id');
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    response.setHeader('x-request-id', requestId);
    (request as Request & { requestId?: string }).requestId = requestId;
    next();
  }
}
