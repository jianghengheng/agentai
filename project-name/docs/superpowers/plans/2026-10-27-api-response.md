# Unified API responses

The user requested `{ code, msg, data }` and selected numeric success code 200.

- Export a reusable generic ApiResponse<T> interface.
- Register a global response interceptor in AppModule. Success returns code=200, msg=success, data=the controller result; undefined becomes null.
- Register a global exception filter. Preserve HTTP 400/404/409/500, return the same envelope with code=HTTP status, a string message, and data=null. Do not expose unknown exception details to clients.
- Change DELETE /user/:id from HTTP 204 to 200 so it can return an envelope with null data. POST still uses HTTP 201 with success code 200.
- Transform generated OpenAPI JSON response schemas centrally so new documented controller responses inherit the envelope. Keep Swagger routes as standard raw OpenAPI/HTML and preserve binary responses.
- Update HTTP and schema contract tests before implementation, verify build/lint/unit/e2e tests and real PostgreSQL CRUD, then synchronize response definitions to the existing agent Apifox project.

## Completed verification

- Unit tests: 14 passed. HTTP e2e tests: 26 passed. Verified normal objects/lists, validation errors, unknown-route 404, conflicts, sanitized 500 responses, null deletion results and raw Swagger routes.
- `pnpm run openapi:export`: build and export passed. The compiler required an explicit guard for optional OpenAPI response entries; the guard is in place and the final 5 OpenAPI tests passed again.
- `pnpm run lint`: passed.
- Compiled AppModule against the existing Docker PostgreSQL: create/read/list/update/delete, validation 400, conflict 409, missing-user 404, Temporal serialization and raw OpenAPI route passed. Temporary users were removed and checked absent.
- Apifox agent project 8974186: updated all 6 endpoint definitions. Read back POST and DELETE to verify the code/msg/data envelope, POST HTTP 201 with body code 200, and DELETE HTTP 200 with nullable data. The POST request example remains present and the import did not modify saved debug cases.
- README describes the generic interface, success/error behavior and changed deletion status.
