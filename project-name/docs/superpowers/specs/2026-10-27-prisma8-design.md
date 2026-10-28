# Prisma 8 PostgreSQL integration

The existing application uses NestJS 12, Node.js 22, TypeScript 6, ESM and pnpm. The user selected PostgreSQL and explicitly requested Prisma 8. Use the available Prisma 8 release candidates and their contract-based API.

## Integration

Install the Prisma CLI as a development dependency and `@prisma/orm-postgres` with its required runtime peers as application dependencies. Author a small User contract as a query example. Emit its JSON and TypeScript contract artifacts inside `src/prisma` for compilation and packaging with NestJS.

Provide an injectable PrismaService through PrismaModule. Read DATABASE_URL from the environment, expose a typed database client, and release resources when NestJS shuts down. Document how another service injects PrismaService and queries users. Keep the existing greeting routes working.

Configure the Prisma 8 CLI with `prisma.config.ts`. Add commands for contract emission, schema synchronization, migrations and database inspection according to the installed CLI. Include `.env.example` and ignore local environment files and build artifacts.

## Verification

Verify the installed CLI and runtime versions, emit the contract, build the project and run lint and the existing tests. The user supplied a local Docker PostgreSQL connection; inspection confirmed an empty public schema. Initialize the User model using additive operations, verify the contract marker and schema, and exercise create/read inside a transaction that is rolled back. No database provisioning is required.
