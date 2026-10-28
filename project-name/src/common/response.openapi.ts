import type { OpenAPIObject } from '@nestjs/swagger';
import { SUCCESS_CODE, SUCCESS_MSG } from './api-response.interface.js';

const methods = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
] as const;

export function wrapOpenApiResponses(document: OpenAPIObject): void {
  for (const path of Object.values(document.paths)) {
    for (const method of methods) {
      const operation = path?.[method];
      if (!operation || method === 'head') continue;

      for (const [status, response] of Object.entries(
        operation.responses ?? {},
      )) {
        if (
          !response ||
          '$ref' in response ||
          status === '204' ||
          status === '304'
        )
          continue;
        const media = response.content?.['application/json'];
        if (response.content && !media) continue;

        const isError = Number(status) >= 400;
        const code = isError ? Number(status) : SUCCESS_CODE;
        const msg = isError ? response.description : SUCCESS_MSG;
        const data =
          isError || !media?.schema
            ? { type: 'object' as const, nullable: true, example: null }
            : media.schema;

        response.content = {
          ...response.content,
          'application/json': {
            ...media,
            schema: {
              type: 'object',
              required: ['code', 'msg', 'data'],
              properties: {
                code: { type: 'integer', example: code },
                msg: { type: 'string', example: msg },
                data,
              },
            },
          },
        };
      }
    }
  }
}
