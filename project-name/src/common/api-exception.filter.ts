import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ApiResponse } from './api-response.interface.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const response = host.switchToHttp().getResponse<unknown>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    let msg = 'Internal server error';

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : 'message' in body
            ? body.message
            : undefined;
      msg = Array.isArray(message)
        ? message
            .filter((item): item is string => typeof item === 'string')
            .join('; ')
        : typeof message === 'string'
          ? message
          : exception.message;
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }

    const body: ApiResponse<null> = { code: status, msg, data: null };
    httpAdapter.reply(response, body, status);
  }
}
