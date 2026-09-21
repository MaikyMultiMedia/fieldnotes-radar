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

export const paperTrials = sqliteTable('paper_trials', {
  id: text('id').primaryKey(), chain: text('chain').notNull(), contract: text('contract').notNull(), pool: text('pool').notNull(),
  status: text('status').notNull(), author: text('author').notNull(), created: integer('created').notNull(), eligible: integer('eligible').notNull(), updated: integer('updated').notNull(),
  revision: integer('revision').notNull().default(1), payload: text('payload').notNull(),
}, t => [index('paper_trials_created_idx').on(t.created),index('paper_trials_status_eligible_idx').on(t.status,t.eligible)]);

export const buyAlertRules = sqliteTable('buy_alert_rules', {
  id: text('id').primaryKey(), payload: text('payload').notNull(), updated: integer('updated').notNull(),
  revision: integer('revision').notNull().default(1), checked: integer('checked').notNull().default(0), scan: text('scan'),
});
export const buyAlerts = sqliteTable('buy_alerts', {
  id: text('id').primaryKey(), detected: integer('detected').notNull(), seen: integer('seen').notNull().default(0), payload: text('payload').notNull(),
}, t => [index('buy_alerts_detected_idx').on(t.detected)]);
