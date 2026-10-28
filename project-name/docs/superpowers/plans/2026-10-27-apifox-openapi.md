# Apifox OpenAPI integration

The user wants NestJS interface changes to appear automatically in Apifox and selected the private agent project (8974186).

- Install the NestJS Swagger integration and enable its CLI plugin for future DTO/controller discovery.
- Generate OpenAPI at `/docs-json`, expose Swagger UI at `/docs`, and provide an offline `openapi:export` command.
- Describe the existing user request DTOs, pagination, response model, UUIDs and HTTP error statuses. Add document contract tests before implementation.
- Verify the compiled document, import it into the selected Apifox project using the existing connector, and read the imported endpoint definitions back.
- Document the one-time Apifox scheduled URL import configuration. Native app automation is unavailable because Computer Use permissions are not granted, so enabling the client setting must be performed by the user.
- Run build, lint, unit/e2e tests and check the live documentation routes. No database schema or business behavior change is needed.

## Verification and current state

- `pnpm run openapi:export`: build and export passed. Generated OpenAPI 3.0 contains 6 operations and 3 schemas; pagination parameters are integers.
- `pnpm run lint`: passed.
- Unit tests: 12 passed, including OpenAPI operation discovery and request/response schema checks.
- E2e tests: 23 passed, including actual `/docs` and `/docs-json` HTTP responses.
- Imported into project 8974186: 6 endpoints, 3 models and the localhost development environment created successfully. Read back endpoint listings plus create/update definitions to confirm required email, nullable name, response models and error statuses.
- Scheduled import is not yet enabled. The user must open Apifox project settings, bind `/docs-json`, select the local client and save a frequency. Official documentation confirms the desktop client can access localhost and only polls while the project is open; a self-hosted Runner is available for continuous operation.

## POST debugging body correction

- The user clarified that the runtime/debug Body was empty. The imported CreateUserDto schema already contained email/name; the saved default HTTP case for POST /user had `requestBody.data` set to an empty string.
- Added a complete `createUser` request example to `@ApiBody` in the controller and a regression test. All 4 OpenAPI tests, export/build and lint passed.
- Re-imported only POST /user and verified its request example was stored in Apifox. Existing saved debugging values were preserved by the importer.
- After explicit user approval to read the case inventory and update only this POST body, set the default case 425082551 to JSON containing email/name. Read the case back and verified both fields and application/json. No request was sent to the application database.
