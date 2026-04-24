import type { Prisma, PrismaClient } from "@/generated/prisma";

export type Db = PrismaClient | Prisma.TransactionClient;

function isTxClient(db: Db): db is Prisma.TransactionClient {
  // PrismaClient exposes $transaction; TransactionClient does not.
  return typeof (db as PrismaClient).$transaction !== "function";
}

/**
 * Run `fn` inside a transaction. If `db` is already a TransactionClient
 * (i.e., we're already inside a $transaction), reuse it. Otherwise open a
 * new transaction. Lets domain services compose without nested $transaction
 * calls.
 */
export async function withTx<T>(
  db: Db,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (isTxClient(db)) return fn(db);
  return (db as PrismaClient).$transaction(fn);
}
