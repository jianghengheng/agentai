import { Injectable, StreamableFile } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { SUCCESS_CODE, SUCCESS_MSG } from './api-response.interface.js';
import type { ApiResponse } from './api-response.interface.js';

@Injectable()
export class ResponseInterceptor implements NestInterceptor<
  unknown,
  ApiResponse | StreamableFile
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<ApiResponse | StreamableFile> {
    return next
      .handle()
      .pipe(
        map((data) =>
          data instanceof StreamableFile
            ? data
            : { code: SUCCESS_CODE, msg: SUCCESS_MSG, data: data ?? null },
        ),
      );
  }
}
