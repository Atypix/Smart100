// tests/database/database.test.ts
import {
  db, // The actual in-memory database instance for tests
  initializeSchema,
  insertData,
  getRecentData,
  getFallbackData,
  queryHistoricalData,
  FinancialData,
} from '../../src/database';

describe('Database Module Tests (Integration with In-Memory DB)', () => {
  beforeEach(() => {
    // Clear all tables and re-initialize schema before each test
    // This ensures a clean state for each test.
    try {
      db.exec('DROP TABLE IF EXISTS financial_data;');
      db.exec('DROP INDEX IF EXISTS idx_symbol;');
      db.exec('DROP INDEX IF EXISTS idx_timestamp;');
      db.exec('DROP INDEX IF EXISTS idx_source_api;');
      db.exec('DROP INDEX IF EXISTS idx_symbol_timestamp_source_interval;');
      
      db.exec('DROP TABLE IF EXISTS users;');
      db.exec('DROP INDEX IF EXISTS idx_users_email;');

      db.exec('DROP TABLE IF EXISTS api_keys;');
      db.exec('DROP INDEX IF EXISTS idx_api_keys_user_id;');
      db.exec('DROP INDEX IF EXISTS idx_api_keys_user_id_exchange_name;');

    } catch (error) {
      // console.error("Error dropping tables/indexes:", error);
      // Ignore if tables/indexes don't exist yet (e.g., first run)
    }
    initializeSchema(); // Re-creates tables and indexes
  });

  afterAll(() => {
    // db.close(); // Closing in-memory DB is optional, often not needed
  });

  test('initializeSchema should create all tables and indexes', () => {
    // Check financial_data table
    const financialTableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_data';").get();
    expect(financialTableInfo).toBeDefined();
    expect((financialTableInfo as any).name).toBe('financial_data');

    const financialIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='financial_data';").all();
    const financialIndexNames = financialIndexes.map((idx: any) => idx.name);
    expect(financialIndexNames).toContain('idx_symbol');
    expect(financialIndexNames).toContain('idx_timestamp');
    expect(financialIndexNames).toContain('idx_source_api');
    expect(financialIndexNames).toContain('idx_symbol_timestamp_source_interval');

    // Check users table
    const usersTableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users';").get();
    expect(usersTableInfo).toBeDefined();
    expect((usersTableInfo as any).name).toBe('users');
    const usersIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users';").all();
    expect(usersIndexes.map((idx: any) => idx.name)).toContain('idx_users_email');
    
    // Check api_keys table
    const apiKeysTableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys';").get();
    expect(apiKeysTableInfo).toBeDefined();
    expect((apiKeysTableInfo as any).name).toBe('api_keys');
    const apiKeysIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='api_keys';").all();
    const apiKeyIndexNames = apiKeysIndexes.map((idx: any) => idx.name);
    expect(apiKeyIndexNames).toContain('idx_api_keys_user_id');
    expect(apiKeyIndexNames).toContain('idx_api_keys_user_id_exchange_name');
  });

  describe('insertData', () => {
    test('should insert a single record correctly', () => {
      const record: FinancialData = {
        symbol: 'TEST', timestamp: 1672531200, open: 100, high: 105, low: 99, close: 102,
        volume: 1000, source_api: 'TestAPI', fetched_at: 1672531260, interval: '5min'
      };
      insertData([record]);

      const savedRecord = db.prepare('SELECT * FROM financial_data WHERE symbol = ?').get('TEST') as FinancialData | undefined;
      expect(savedRecord).toBeDefined();
      // SQLite stores numbers, so parseFloat for comparison if necessary, though direct should work.
      expect(savedRecord?.symbol).toBe(record.symbol);
      expect(savedRecord?.timestamp).toBe(record.timestamp);
      expect(savedRecord?.open).toBe(record.open);
      expect(savedRecord?.high).toBe(record.high);
      expect(savedRecord?.low).toBe(record.low);
      expect(savedRecord?.close).toBe(record.close);
      expect(savedRecord?.volume).toBe(record.volume);
      expect(savedRecord?.source_api).toBe(record.source_api);
      expect(savedRecord?.fetched_at).toBe(record.fetched_at);
      expect(savedRecord?.interval).toBe(record.interval);
    });

    test('should insert multiple records correctly', () => {
      const records: FinancialData[] = [
        { symbol: 'TEST1', timestamp: 1672531200, open: 100, high: 105, low: 99, close: 102, volume: 1000, source_api: 'TestAPI', fetched_at: 1672531260, interval: '5min' },
        { symbol: 'TEST2', timestamp: 1672531201, open: 200, high: 205, low: 199, close: 202, volume: 2000, source_api: 'TestAPI', fetched_at: 1672531261, interval: '5min' },
      ];
      insertData(records);

      const savedRecords = db.prepare('SELECT * FROM financial_data WHERE source_api = ? ORDER BY symbol ASC').all('TestAPI') as FinancialData[];
      expect(savedRecords.length).toBe(2);
      expect(savedRecords[0].symbol).toBe('TEST1');
      expect(savedRecords[1].symbol).toBe('TEST2');
      expect(savedRecords[0].close).toBe(102);
      expect(savedRecords[1].close).toBe(202);
    });
  });

  describe('getRecentData', () => {
    const now = Math.floor(Date.now() / 1000);
    const recentTime = now - 10 * 60; // 10 minutes ago
    const oldTime = now - 30 * 60;    // 30 minutes ago
    
    const sampleData: FinancialData[] = [
      { symbol: 'AAPL', timestamp: now - 12*60, open: 150, high: 152, low: 149, close: 151, volume: 1000, source_api: 'API1', fetched_at: recentTime, interval: '1min' },
      { symbol: 'AAPL', timestamp: now - 25*60, open: 140, high: 142, low: 139, close: 141, volume: 1200, source_api: 'API1', fetched_at: oldTime, interval: '1min' }, // Old fetched_at
      { symbol: 'MSFT', timestamp: now - 5*60, open: 250, high: 252, low: 249, close: 251, volume: 800, source_api: 'API1', fetched_at: recentTime, interval: '1min' },
      { symbol: 'AAPL', timestamp: now - 2*60, open: 155, high: 156, low: 154, close: 155, volume: 1100, source_api: 'API1', fetched_at: recentTime, interval: '1min' }, // Another recent AAPL
    ];

    beforeEach(() => {
      insertData(sampleData);
    });

    test('should return only recent data for a specific symbol, source_api, and interval', () => {
      const result = getRecentData('AAPL', 'API1', '1min', now - 15 * 60); // Threshold is 15 mins ago
      expect(result.length).toBe(2); // Two AAPL records are recent
      expect(result.every(r => r.symbol === 'AAPL' && r.fetched_at >= (now - 15*60))).toBe(true);
      // Check sorting (DESC by timestamp)
      expect(result[0].timestamp).toBeGreaterThan(result[1].timestamp);
    });

    test('should return empty array if no recent data found for criteria', () => {
      const result = getRecentData('GOOG', 'API1', '1min', now - 15 * 60);
      expect(result.length).toBe(0);
    });
     test('should return empty array if all data is older than threshold', () => {
      const result = getRecentData('AAPL', 'API1', '1min', now + 60); // Threshold in the future
      expect(result.length).toBe(0);
    });
  });

  describe('getFallbackData', () => {
    const now = Math.floor(Date.now() / 1000);
    const fetch1 = now - 60 * 60;     // 1 hour ago (most recent for GOOG API2 5min)
    const fetch2 = now - 2 * 60 * 60; // 2 hours ago
    
    const sampleFallbackData: FinancialData[] = [
      // Batch 1 (most recent fetch for GOOG, API2, 5min)
      { symbol: 'GOOG', timestamp: fetch1 - 200, open: 99, high: 100, low: 98, close: 99, volume: 110, source_api: 'API2', fetched_at: fetch1, interval: '5min' },
      { symbol: 'GOOG', timestamp: fetch1 - 100, open: 100, high: 101, low: 99, close: 100, volume: 100, source_api: 'API2', fetched_at: fetch1, interval: '5min' },
      // Batch 2 (older fetch for GOOG, API2, 5min)
      { symbol: 'GOOG', timestamp: fetch2 - 100, open: 95, high: 96, low: 94, close: 95, volume: 120, source_api: 'API2', fetched_at: fetch2, interval: '5min' },
      // Different symbol or API or interval
      { symbol: 'MSFT', timestamp: fetch1 - 100, open: 200, high: 201, low: 199, close: 200, volume: 130, source_api: 'API2', fetched_at: fetch1, interval: '5min' },
      { symbol: 'GOOG', timestamp: fetch1 - 50, open: 101, high: 102, low: 100, close: 101, volume: 140, source_api: 'API_OTHER', fetched_at: fetch1, interval: '5min' },
      { symbol: 'GOOG', timestamp: fetch1 - 20, open: 102, high: 103, low: 101, close: 102, volume: 150, source_api: 'API2', fetched_at: fetch1, interval: '1min' },
    ];

    beforeEach(() => {
      insertData(sampleFallbackData);
    });

    test('should return all records from the most recent fetch for the given criteria, sorted by timestamp DESC', () => {
      const result = getFallbackData('GOOG', 'API2', '5min');
      expect(result.length).toBe(2);
      expect(result.every(r => r.symbol === 'GOOG' && r.source_api === 'API2' && r.interval === '5min' && r.fetched_at === fetch1)).toBe(true);
      expect(result[0].timestamp).toBe(fetch1 - 100); // Most recent timestamp from that batch
      expect(result[1].timestamp).toBe(fetch1 - 200);
    });

    test('should return empty array if no data found for criteria', () => {
      const result = getFallbackData('AMZN', 'API2', '5min');
      expect(result.length).toBe(0);
    });
  });

  describe('queryHistoricalData', () => {
    const now = Math.floor(Date.now() / 1000);
    const data: FinancialData[] = [
      { symbol: 'TSLA', timestamp: now - 3*86400, open: 200, high: 205, low: 195, close: 202, volume: 1000, source_api: 'API_H', fetched_at: now, interval: '1d' },
      { symbol: 'TSLA', timestamp: now - 2*86400, open: 202, high: 208, low: 200, close: 205, volume: 1200, source_api: 'API_H', fetched_at: now, interval: '1d' },
      { symbol: 'TSLA', timestamp: now - 1*86400, open: 205, high: 210, low: 203, close: 208, volume: 1100, source_api: 'API_H', fetched_at: now, interval: '1d' },
      { symbol: 'TSLA', timestamp: now - 1*86400 + 3600, open: 207, high: 210, low: 206, close: 209, volume: 500, source_api: 'API_H_5min', fetched_at: now, interval: '5min' }, // Same day, different interval/API
      { symbol: 'NVDA', timestamp: now - 2*86400, open: 300, high: 305, low: 295, close: 303, volume: 2000, source_api: 'API_H', fetched_at: now, interval: '1d' },
      { symbol: 'TSLA', timestamp: now, open: 210, high: 212, low: 208, close: 211, volume: 1300, source_api: 'API_H', fetched_at: now, interval: '1d' }, // Today's data
    ];

    beforeEach(() => {
      insertData(data);
    });

    test('should retrieve by symbol and date range, sorted by timestamp ASC', () => {
      const result = queryHistoricalData('TSLA', now - 3*86400, now - 1*86400);
      expect(result.length).toBe(3); 
      expect(result[0].timestamp).toBe(now - 3*86400);
      expect(result[1].timestamp).toBe(now - 2*86400);
      expect(result[2].timestamp).toBe(now - 1*86400);
      expect(result.every(r => r.symbol === 'TSLA')).toBe(true);
    });

    test('should filter by source_api if provided', () => {
      const result = queryHistoricalData('TSLA', now - 1*86400, now, 'API_H_5min');
      expect(result.length).toBe(1);
      expect(result[0].source_api).toBe('API_H_5min');
      expect(result[0].interval).toBe('5min');
    });

    test('should filter by interval if provided', () => {
      const resultDaily = queryHistoricalData('TSLA', now - 3*86400, now, undefined, '1d');
      expect(resultDaily.length).toBe(4); // Includes today's record
      expect(resultDaily.every(r => r.interval === '1d')).toBe(true);
      
      const result5min = queryHistoricalData('TSLA', now - 1*86400, now, undefined, '5min');
      expect(result5min.length).toBe(1);
      expect(result5min[0].interval).toBe('5min');
    });
    
    test('should filter by both source_api and interval', () => {
      const result = queryHistoricalData('TSLA', now - 1*86400, now, 'API_H_5min', '5min');
      expect(result.length).toBe(1);
      expect(result[0].source_api).toBe('API_H_5min');
      expect(result[0].interval).toBe('5min');
    });

    test('should return empty array if no data matches criteria', () => {
      const result = queryHistoricalData('AMD', now - 3*86400, now);
      expect(result.length).toBe(0);
    });

    test('should be sorted by timestamp ascending (default)', () => {
      const result = queryHistoricalData('TSLA', now - 3*86400, now, 'API_H', '1d');
      expect(result.length).toBe(4); // includes today's record
      expect(result[0].timestamp).toBe(now - 3*86400);
      expect(result[1].timestamp).toBe(now - 2*86400);
      expect(result[2].timestamp).toBe(now - 1*86400);
      expect(result[3].timestamp).toBe(now);
    });
  });
});
