import 'dotenv/config';
import 'temporal-polyfill/full/global';
import postgres, { type PostgresClient } from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import type { Contract } from './contract.d.js';
import contractJson from './contract.json' with { type: 'json' };

const contract = contractFromJson<Contract>(contractJson);

export function createDatabase(): PostgresClient<Contract> {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is required. Configure it in .env.');
  }

  return postgres({
    contract,
    url,
    poolOptions: { connectionTimeoutMillis: 5000 },
  });
}
