/**
 * ═══════════════════════════════════════════════════════════════
 * AquaRoute — IndexedDB Database Layer
 * 
 * Stores: localities | tankers | schedules
 * Auto-saves on every add/edit/delete
 * Supports full CRUD + schedule history log
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

const DB_NAME    = 'AquaRouteDB';
const DB_VERSION = 1;

const STORES = {
  LOCALITIES: 'localities',
  TANKERS:    'tankers',
  SCHEDULES:  'schedules',
};

/* ════════════════════════════════════════════════
   AquaDB — IndexedDB wrapper
════════════════════════════════════════════════ */
class AquaDB {
  constructor() {
    this.db = null;
    this.ready = false;
  }

  /** Open (or create) the database */
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Localities store
        if (!db.objectStoreNames.contains(STORES.LOCALITIES)) {
          const ls = db.createObjectStore(STORES.LOCALITIES, { keyPath: 'id' });
          ls.createIndex('severity', 'severity', { unique: false });
          ls.createIndex('name',     'name',     { unique: false });
        }

        // Tankers store
        if (!db.objectStoreNames.contains(STORES.TANKERS)) {
          const ts = db.createObjectStore(STORES.TANKERS, { keyPath: 'internalId' });
          ts.createIndex('tankerId', 'tankerId', { unique: true });
          ts.createIndex('status',   'status',   { unique: false });
        }

        // Schedule history store
        if (!db.objectStoreNames.contains(STORES.SCHEDULES)) {
          const ss = db.createObjectStore(STORES.SCHEDULES, {
            keyPath: 'scheduleId', autoIncrement: true,
          });
          ss.createIndex('generatedAt', 'generatedAt', { unique: false });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        this.ready = true;
        resolve(this.db);
      };

      req.onerror = (e) => reject(e.target.error);
    });
  }

  /* ── Generic helpers ── */
  _tx(store, mode = 'readonly') {
    return this.db.transaction(store, mode).objectStore(store);
  }

  _promisify(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  /* ── LOCALITIES ── */
  async saveLocality(loc) {
    return this._promisify(this._tx(STORES.LOCALITIES, 'readwrite').put(loc.toJSON()));
  }

  async deleteLocality(id) {
    return this._promisify(this._tx(STORES.LOCALITIES, 'readwrite').delete(id));
  }

  async getAllLocalities() {
    return this._promisify(this._tx(STORES.LOCALITIES).getAll());
  }

  async clearLocalities() {
    return this._promisify(this._tx(STORES.LOCALITIES, 'readwrite').clear());
  }

  /* ── TANKERS ── */
  async saveTanker(tanker) {
    return this._promisify(this._tx(STORES.TANKERS, 'readwrite').put(tanker.toJSON()));
  }

  async deleteTanker(internalId) {
    return this._promisify(this._tx(STORES.TANKERS, 'readwrite').delete(internalId));
  }

  async getAllTankers() {
    return this._promisify(this._tx(STORES.TANKERS).getAll());
  }

  async clearTankers() {
    return this._promisify(this._tx(STORES.TANKERS, 'readwrite').clear());
  }

  /* ── SCHEDULE HISTORY ── */
  async saveScheduleRun(scheduleData) {
    return this._promisify(
      this._tx(STORES.SCHEDULES, 'readwrite').add(scheduleData)
    );
  }

  async getAllSchedules() {
    return this._promisify(this._tx(STORES.SCHEDULES).getAll());
  }

  async deleteSchedule(scheduleId) {
    return this._promisify(this._tx(STORES.SCHEDULES, 'readwrite').delete(scheduleId));
  }

  async clearSchedules() {
    return this._promisify(this._tx(STORES.SCHEDULES, 'readwrite').clear());
  }

  /* ── STATS ── */
  async getStoreCounts() {
    const [localities, tankers, schedules] = await Promise.all([
      this._promisify(this._tx(STORES.LOCALITIES).count()),
      this._promisify(this._tx(STORES.TANKERS).count()),
      this._promisify(this._tx(STORES.SCHEDULES).count()),
    ]);
    return { localities, tankers, schedules };
  }
}

/* Export singleton */
window.AquaDB = AquaDB;
window.DB_STORES = STORES;
