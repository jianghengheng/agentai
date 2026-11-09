import 'dotenv/config';
import 'temporal-polyfill/full/global';
import postgres, { type PostgresClient } from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { Contract } from './contract.d.js';
import contractJson from './contract.json' with { type: 'json' };
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
const contract = contractFromJson<Contract>(contractJson);

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is required. Configure it in .env.');
  }

  return url;
}

export function createDatabase(): PostgresClient<Contract> {
  return postgres({
    contract,
    url: getDatabaseUrl(),
    poolOptions: { connectionTimeoutMillis: 5000 },
  });
}

export function createCheckpointer(): PostgresSaver {
  return PostgresSaver.fromConnString(getDatabaseUrl());
}

export function createStore(): PostgresStore {
  return PostgresStore.fromConnString(getDatabaseUrl());
}
