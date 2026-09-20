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
