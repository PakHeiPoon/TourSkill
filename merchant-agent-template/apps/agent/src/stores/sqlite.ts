/**
 * SQLite-backed `MerchantStore` implementation.
 *
 * Default storage for solo merchants. Cheap, single-file, zero ops.
 * Implements the `MerchantStore` interface using Drizzle for query
 * building and `better-sqlite3` for sync access (Hono runs single-
 * threaded so sync is fine; no IPC contention).
 *
 * For multi-tenant deployments, swap in PostgresStore (Phase ≥ A.4).
 * Both implementations satisfy the same interface; calling code stays
 * unchanged.
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, asc, between, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import type {
  MerchantStore, MerchantSettings,
  InventoryItem, DailyAvailability,
  Booking, BookingDraft, DateRange,
} from '../core/types.js';

import { items, calendar, bookings, settings } from './schema.js';

// ─── Migration SQL ────────────────────────────────────────────────────
// Plain CREATE TABLE statements derived from schema.ts. We don't use
// drizzle-kit generate at runtime because that adds a build-time
// dependency for what's a few `CREATE TABLE IF NOT EXISTS` lines.
const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS inventory_items (
  item_id           TEXT PRIMARY KEY NOT NULL,
  item_type         TEXT NOT NULL,
  name_json         TEXT NOT NULL DEFAULT '{}',
  description_json  TEXT NOT NULL DEFAULT '{}',
  base_rate_usdc    INTEGER NOT NULL DEFAULT 0,
  attributes_json   TEXT NOT NULL DEFAULT '{}',
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar (
  item_id              TEXT NOT NULL,
  date                 TEXT NOT NULL,
  available_count      INTEGER NOT NULL DEFAULT 0,
  override_rate_usdc   INTEGER NOT NULL DEFAULT 0,
  updated_at           INTEGER NOT NULL,
  PRIMARY KEY (item_id, date),
  FOREIGN KEY (item_id) REFERENCES inventory_items(item_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  booking_id         TEXT PRIMARY KEY NOT NULL,
  confirmation_code  TEXT NOT NULL,
  item_id            TEXT NOT NULL,
  start_date         TEXT NOT NULL,
  end_date           TEXT NOT NULL,
  total_usdc         INTEGER NOT NULL,
  payer_address      TEXT NOT NULL,
  escrow_tx_hash     TEXT,
  release_at         INTEGER,
  status             TEXT NOT NULL DEFAULT 'pending',
  metadata_json      TEXT NOT NULL DEFAULT '{}',
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_payer_idx     ON bookings (payer_address);
CREATE INDEX IF NOT EXISTS bookings_status_idx    ON bookings (status);
CREATE INDEX IF NOT EXISTS bookings_dates_idx     ON bookings (start_date, end_date);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY NOT NULL,
  value_json  TEXT NOT NULL DEFAULT '{}',
  updated_at  INTEGER NOT NULL
);
`;

const DEFAULT_SETTINGS: MerchantSettings = {
  name:        { en: 'Untitled Merchant', zh: '未命名商家' },
  description: { en: 'A new merchant on Concourse.', zh: 'Concourse 上的新商家。' },
  merchantType: 'hotel',
  location: {
    country: 'CN',
    city:    'huangshan',
    address: 'TBD',
  },
  contact: {},
  payment: {
    chain:           'base-sepolia',
    chainId:         84532,
    payoutAddress:   '0x0000000000000000000000000000000000000000',
    currency:        'USDC',
    currencyAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  languagesSupported: ['en'],
};

// ─── Helpers ──────────────────────────────────────────────────────────

function now(): Date { return new Date(); }
function toUnix(d: Date): number { return Math.floor(d.getTime() / 1000); }
function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ─── SQLiteStore ──────────────────────────────────────────────────────

export class SQLiteStore implements MerchantStore {
  private readonly db: BetterSQLite3Database;
  private readonly raw: Database.Database;

  constructor(filename: string) {
    this.raw = new Database(filename);
    this.raw.pragma('journal_mode = WAL');
    this.raw.pragma('foreign_keys = ON');
    this.raw.exec(MIGRATIONS);

    // Seed default settings row if absent
    const existing = this.raw
      .prepare('SELECT key FROM settings WHERE key = ?')
      .get('default');
    if (!existing) {
      this.raw
        .prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
        .run('default', JSON.stringify(DEFAULT_SETTINGS), toUnix(now()));
    }

    this.db = drizzle(this.raw);
  }

  /** For tests: close handle so SQLite releases the file. */
  close(): void {
    this.raw.close();
  }

  // ─── Inventory ──────────────────────────────────────────────────────

  async listItems(filter?: { itemType?: string; active?: boolean }): Promise<InventoryItem[]> {
    const where = [];
    if (filter?.itemType !== undefined) where.push(eq(items.itemType, filter.itemType));
    if (filter?.active   !== undefined) where.push(eq(items.active, filter.active));

    const rows = await this.db
      .select()
      .from(items)
      .where(where.length ? and(...where) : undefined)
      .all();

    return rows.map(rowToItem);
  }

  async getItem(itemId: string): Promise<InventoryItem | null> {
    const row = await this.db.select().from(items).where(eq(items.itemId, itemId)).get();
    return row ? rowToItem(row) : null;
  }

  async upsertItem(item: Omit<InventoryItem, 'createdAt' | 'updatedAt'>): Promise<void> {
    const ts = now();
    await this.db
      .insert(items)
      .values({
        itemId:          item.itemId,
        itemType:        item.itemType,
        nameJson:        JSON.stringify(item.name),
        descriptionJson: JSON.stringify(item.description),
        baseRateUsdc:    item.baseRateUsdc,
        attributesJson:  JSON.stringify(item.attributes),
        active:          item.active,
        createdAt:       ts,
        updatedAt:       ts,
      })
      .onConflictDoUpdate({
        target: items.itemId,
        set: {
          itemType:        item.itemType,
          nameJson:        JSON.stringify(item.name),
          descriptionJson: JSON.stringify(item.description),
          baseRateUsdc:    item.baseRateUsdc,
          attributesJson:  JSON.stringify(item.attributes),
          active:          item.active,
          updatedAt:       ts,
        },
      })
      .run();
  }

  // ─── Calendar ───────────────────────────────────────────────────────

  async getAvailability(itemId: string, range: DateRange): Promise<DailyAvailability[]> {
    // Range semantics: from inclusive, to exclusive.
    // SQLite text sort works for ISO YYYY-MM-DD by lexicographic order.
    const rows = await this.db
      .select()
      .from(calendar)
      .where(
        and(
          eq(calendar.itemId, itemId),
          gte(calendar.date, range.from),
          // strict-less-than 'to' to honor exclusive upper bound
          sql`${calendar.date} < ${range.to}`,
        ),
      )
      .orderBy(asc(calendar.date))
      .all();

    return rows.map((r) => ({
      itemId:           r.itemId,
      date:             r.date,
      availableCount:   r.availableCount,
      overrideRateUsdc: r.overrideRateUsdc,
    }));
  }

  async setAvailability(itemId: string, date: string, availableCount: number): Promise<void> {
    const ts = now();
    await this.db
      .insert(calendar)
      .values({ itemId, date, availableCount, overrideRateUsdc: 0, updatedAt: ts })
      .onConflictDoUpdate({
        target: [calendar.itemId, calendar.date],
        set:    { availableCount, updatedAt: ts },
      })
      .run();
  }

  async setRateOverride(itemId: string, date: string, overrideRateUsdc: number): Promise<void> {
    const ts = now();
    await this.db
      .insert(calendar)
      .values({ itemId, date, availableCount: 0, overrideRateUsdc, updatedAt: ts })
      .onConflictDoUpdate({
        target: [calendar.itemId, calendar.date],
        set:    { overrideRateUsdc, updatedAt: ts },
      })
      .run();
  }

  // ─── Bookings ───────────────────────────────────────────────────────

  async createBooking(b: BookingDraft & { confirmationCode: string }): Promise<Booking> {
    const ts = now();
    const bookingId = `bk_${cryptoRandomId()}`;

    await this.db
      .insert(bookings)
      .values({
        bookingId,
        confirmationCode: b.confirmationCode,
        itemId:           b.itemId,
        startDate:        b.startDate,
        endDate:          b.endDate,
        totalUsdc:        b.totalUsdc,
        payerAddress:     b.payerAddress.toLowerCase(),
        escrowTxHash:     null,
        releaseAt:        null,
        status:           'pending',
        metadataJson:     JSON.stringify(b.metadata ?? {}),
        createdAt:        ts,
        updatedAt:        ts,
      })
      .run();

    const created = await this.getBooking(bookingId);
    if (!created) throw new Error('createBooking: row vanished after insert');
    return created;
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    const row = await this.db.select().from(bookings).where(eq(bookings.bookingId, bookingId)).get();
    return row ? rowToBooking(row) : null;
  }

  async listBookings(filter?: {
    payerAddress?: string;
    status?:       Booking['status'];
    fromDate?:     string;
    toDate?:       string;
  }): Promise<Booking[]> {
    const where = [];
    if (filter?.payerAddress) where.push(eq(bookings.payerAddress, filter.payerAddress.toLowerCase()));
    if (filter?.status)       where.push(eq(bookings.status, filter.status));
    if (filter?.fromDate && filter?.toDate) {
      where.push(between(bookings.startDate, filter.fromDate, filter.toDate));
    } else if (filter?.fromDate) {
      where.push(gte(bookings.startDate, filter.fromDate));
    } else if (filter?.toDate) {
      where.push(lte(bookings.startDate, filter.toDate));
    }

    const rows = await this.db
      .select()
      .from(bookings)
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(bookings.startDate))
      .all();

    return rows.map(rowToBooking);
  }

  async updateBookingStatus(
    bookingId: string,
    status: Booking['status'],
    extra?: { escrowTxHash?: string; releaseAt?: number },
  ): Promise<void> {
    const updates: Record<string, unknown> = { status, updatedAt: now() };
    if (extra?.escrowTxHash !== undefined) updates.escrowTxHash = extra.escrowTxHash;
    if (extra?.releaseAt    !== undefined) updates.releaseAt    = extra.releaseAt;

    await this.db.update(bookings).set(updates).where(eq(bookings.bookingId, bookingId)).run();
  }

  // ─── Settings ───────────────────────────────────────────────────────

  async getSettings(): Promise<MerchantSettings> {
    const row = await this.db.select().from(settings).where(eq(settings.key, 'default')).get();
    if (!row) return DEFAULT_SETTINGS;
    return parseJson<MerchantSettings>(row.valueJson, DEFAULT_SETTINGS);
  }

  async setSettings(s: MerchantSettings): Promise<void> {
    const ts = now();
    await this.db
      .insert(settings)
      .values({ key: 'default', valueJson: JSON.stringify(s), updatedAt: ts })
      .onConflictDoUpdate({
        target: settings.key,
        set:    { valueJson: JSON.stringify(s), updatedAt: ts },
      })
      .run();
  }

  // Used by tests; not part of the public interface.
  /** @internal */ getRaw(): Database.Database { return this.raw; }
}

// ─── Row → Domain mapping ─────────────────────────────────────────────

function rowToItem(r: typeof items.$inferSelect): InventoryItem {
  return {
    itemId:        r.itemId,
    itemType:      r.itemType,
    name:          parseJson(r.nameJson, { en: '' }),
    description:   parseJson(r.descriptionJson, { en: '' }),
    baseRateUsdc:  r.baseRateUsdc,
    attributes:    parseJson(r.attributesJson, {} as Record<string, unknown>),
    active:        r.active,
    createdAt:     r.createdAt,
    updatedAt:     r.updatedAt,
  };
}

function rowToBooking(r: typeof bookings.$inferSelect): Booking {
  return {
    bookingId:        r.bookingId,
    confirmationCode: r.confirmationCode,
    itemId:           r.itemId,
    startDate:        r.startDate,
    endDate:          r.endDate,
    totalUsdc:        r.totalUsdc,
    payerAddress:     r.payerAddress,
    escrowTxHash:     r.escrowTxHash,
    releaseAt:        r.releaseAt,
    status:           r.status as Booking['status'],
    metadata:         parseJson(r.metadataJson, {} as Record<string, unknown>),
    createdAt:        r.createdAt,
    updatedAt:        r.updatedAt,
  };
}

// Suppress drizzle's lint warning about unused `inArray` import if we
// remove some queries later. (We keep the import to discourage churn.)
void inArray;

// ─── Crypto helpers ──────────────────────────────────────────────────

function cryptoRandomId(bytes = 9): string {
  // 9 random bytes → 12 base32 chars (no padding); plenty of entropy
  // for booking IDs without depending on uuid lib.
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString('base64url');
}
