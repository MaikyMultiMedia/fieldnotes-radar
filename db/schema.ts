import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(), user: text('user').notNull(), expires: integer('expires').notNull(),
});
export const throttle = sqliteTable('login_throttle', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), expires: integer('expires').notNull(),
});
export const watchlist = sqliteTable('watchlist', {
  id: text('id').primaryKey(), chain: text('chain').notNull(), contract: text('contract').notNull(),
  symbol: text('symbol').notNull(), name: text('name').notNull(), notes: text('notes').notNull(),
  status: text('status').notNull(), author: text('author').notNull(), updated: integer('updated').notNull(),
  revision: integer('revision').notNull().default(1),
}, t => [index('watchlist_updated_idx').on(t.updated)]);
export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(), user: text('user').notNull(), action: text('action').notNull(),
  subject: text('subject').notNull(), at: integer('at').notNull(),
}, t => [index('activity_at_idx').on(t.at)]);

export const marketCache = sqliteTable('market_cache', {
  key: text('key').primaryKey(), payload: text('payload').notNull(), fetched: integer('fetched').notNull(),
}, t => [index('market_cache_fetched_idx').on(t.fetched)]);
export const marketBudget = sqliteTable('market_budget', {
  id: text('id').primaryKey(), calls: integer('calls').notNull(), windowStart: integer('window_start').notNull(), blockedUntil: integer('blocked_until').notNull(),
});

export const wallets = sqliteTable('wallets', {
  id: text('id').primaryKey(), chain: text('chain').notNull(), address: text('address').notNull(),
  label: text('label').notNull(), author: text('author').notNull(), updated: integer('updated').notNull(),
  revision: integer('revision').notNull().default(1),
}, t => [index('wallets_updated_idx').on(t.updated)]);
