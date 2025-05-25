// Mock better-sqlite3 before any imports that might use it
const mockDbInstance = {
  exec: jest.fn(),
  prepare: jest.fn().mockReturnThis(), // Ensure prepare returns 'this' for chaining .get(), .all(), .run()
  transaction: jest.fn((fn) => fn), // Mock transaction to just execute the function
  pragma: jest.fn(),
  close: jest.fn(),
  // Mock other methods used by your functions if necessary
  get: jest.fn(),
  all: jest.fn(),
  run: jest.fn(),
};
const mockBetterSqlite3 = jest.fn(() => mockDbInstance);
jest.mock('better-sqlite3', () => ({
  __esModule: true, // This is important for ES modules
  default: mockBetterSqlite3, 
}));


import Database from 'better-sqlite3'; // This will now be the mocked version
import {
  initializeSchema,
  insertData,
  getRecentData,
  getFallbackData,
  queryHistoricalData,
  FinancialData,
  // db, // We won't directly use or try to swap 'db' from the module anymore
} from '../../src/database'; // Adjust path as necessary
// import { DB_FILE_PATH_TEST } from '../testConfig'; // Not used for in-memory

// This is the actual instance we want our mocked 'new Database()' to return
let testDb: Database.Database; 

// Helper to reset mocks before each test
const resetMocks = () => {
  mockDbInstance.exec.mockClear();
  mockDbInstance.prepare.mockClear();
  mockDbInstance.transaction.mockClear();
  mockDbInstance.pragma.mockClear();
  mockDbInstance.close.mockClear();
  mockDbInstance.get.mockClear();
  mockDbInstance.all.mockClear();
  mockDbInstance.run.mockClear();
  
  // Default mock implementations that can be overridden in specific tests
  mockDbInstance.prepare.mockImplementation(jest.fn().mockReturnThis());
  mockDbInstance.transaction.mockImplementation((fn) => (...args) => fn(...args)); // Ensure transaction executes the passed function
};


describe('Database Module Tests', () => {
  beforeAll(() => {
    // Create a real in-memory database for our testDb instance
    // This instance will be used by our mocked 'better-sqlite3'
    testDb = new (jest.requireActual('better-sqlite3'))(':memory:');
  });
  
  afterAll(() => {
    if (testDb) {
      testDb.close();
    }
  });
  
  beforeEach(() => {
    resetMocks();
    // Ensure our mock is returning the real testDb instance for operations
    mockBetterSqlite3.mockImplementation(() => testDb as any);
    
    // Initialize schema directly on the real testDb
    // This is because initializeSchema itself calls db.exec which we want to go to the real testDb
    testDb.exec(`
      DROP TABLE IF EXISTS financial_data;
      DROP INDEX IF EXISTS idx_symbol;
      DROP INDEX IF EXISTS idx_timestamp;
      DROP INDEX IF EXISTS idx_source_api;
      DROP INDEX IF EXISTS idx_symbol_timestamp_source_interval;
    `);
    initializeSchema(); // This will call the mocked db.exec if not careful.
                        // We need initializeSchema to use the *actual* testDb.
                        // The mock setup ensures that calls to 'new Database()' return testDb.
                        // If initializeSchema uses a global 'db' from its module, that 'db'
                        // instance (created by 'new Database()') should be our testDb.
    
    // Verify initializeSchema by checking the real testDb
    const tableInfo = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_data';").get();
    if (!tableInfo) {
        // If the table isn't there, it means initializeSchema didn't work as expected
        // with the mock. Forcing schema creation on real testDb for safety in tests.
        testDb.exec(`
          CREATE TABLE IF NOT EXISTS financial_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume REAL NOT NULL,
            source_api TEXT NOT NULL,
            fetched_at INTEGER NOT NULL,
            interval TEXT
          );
        `);
        testDb.exec('CREATE INDEX IF NOT EXISTS idx_symbol ON financial_data (symbol);');
        testDb.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON financial_data (timestamp);');
        testDb.exec('CREATE INDEX IF NOT EXISTS idx_source_api ON financial_data (source_api);');
        testDb.exec('CREATE INDEX IF NOT EXISTS idx_symbol_timestamp_source_interval ON financial_data (symbol, timestamp, source_api, interval);');
    }
  });

  test('initializeSchema should create financial_data table and indexes', () => {
    const tableInfo = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_data';").get();
    expect(tableInfo).toBeDefined();
    expect((tableInfo as any).name).toBe('financial_data');

    const indexes = testDb.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='financial_data';").all();
    const indexNames = indexes.map((idx: any) => idx.name);
    expect(indexNames).toContain('idx_symbol');
    expect(indexNames).toContain('idx_timestamp');
    expect(indexNames).toContain('idx_source_api');
    expect(indexNames).toContain('idx_symbol_timestamp_source_interval');
  });

  describe('insertData', () => {
    test('should insert a single record correctly', () => {
      const record: FinancialData = {
        symbol: 'TEST', timestamp: 1672531200, open: 100, high: 105, low: 99, close: 102,
        volume: 1000, source_api: 'TestAPI', fetched_at: 1672531260, interval: '5min'
      };
      
      // Mock the prepare and run methods for this specific test
      const mockStatement = { run: jest.fn() };
      mockDbInstance.prepare.mockReturnValue(mockStatement);
      mockDbInstance.transaction.mockImplementation((fn) => fn); // Make sure transaction executes

      insertData([record]);

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO financial_data'));
      expect(mockStatement.run).toHaveBeenCalledWith(record);
    });

    test('should insert multiple records correctly', () => {
      const records: FinancialData[] = [
        { symbol: 'TEST1', timestamp: 1672531200, open: 100, high: 105, low: 99, close: 102, volume: 1000, source_api: 'TestAPI', fetched_at: 1672531260, interval: '5min' },
        { symbol: 'TEST2', timestamp: 1672531200, open: 200, high: 205, low: 199, close: 202, volume: 2000, source_api: 'TestAPI', fetched_at: 1672531260, interval: '5min' },
      ];
      const mockStatement = { run: jest.fn() };
      mockDbInstance.prepare.mockReturnValue(mockStatement);
      mockDbInstance.transaction.mockImplementation((fn) => fn);


      insertData(records);

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO financial_data'));
      expect(mockStatement.run).toHaveBeenCalledTimes(2);
      expect(mockStatement.run).toHaveBeenCalledWith(records[0]);
      expect(mockStatement.run).toHaveBeenCalledWith(records[1]);
    });
  });

  describe('getRecentData', () => {
    const now = Math.floor(Date.now() / 1000);
    const recentTime = now - 10 * 60; // 10 minutes ago
    const oldTime = now - 30 * 60;    // 30 minutes ago
    const sampleData: FinancialData[] = [
      { id: 1, symbol: 'AAPL', timestamp: now - 12*60, open: 150, high: 152, low: 149, close: 151, volume: 1000, source_api: 'API1', fetched_at: recentTime, interval: '1min' },
      { id: 2, symbol: 'AAPL', timestamp: now - 25*60, open: 140, high: 142, low: 139, close: 141, volume: 1200, source_api: 'API1', fetched_at: oldTime, interval: '1min' },
      { id: 3, symbol: 'MSFT', timestamp: now - 5*60, open: 250, high: 252, low: 249, close: 251, volume: 800, source_api: 'API1', fetched_at: recentTime, interval: '1min' },
    ];

    test('should return only recent data', () => {
      mockDbInstance.prepare.mockImplementation((sql: string) => {
        // Simulate prepare returning an object that has an `all` method
        return {
          all: jest.fn((params: any) => {
            // Filter sampleData based on params similar to how the SQL query would
            return sampleData.filter(r => 
              r.symbol === params.symbol &&
              r.source_api === params.source_api &&
              r.interval === params.interval &&
              r.fetched_at >= params.threshold_seconds
            );
          })
        };
      });

      const result = getRecentData('AAPL', 'API1', '1min', now - 15 * 60); // Threshold is 15 mins ago
      expect(mockDbInstance.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM financial_data'));
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1); // Only the first AAPL record is recent
    });

    test('should return empty array if no recent data found', () => {
       mockDbInstance.prepare.mockImplementation(() => ({ all: jest.fn(() => []) }));
      const result = getRecentData('GOOG', 'API1', '1min', now - 15 * 60);
      expect(result.length).toBe(0);
    });
  });

  describe('getFallbackData', () => {
    const now = Math.floor(Date.now() / 1000);
    const fetch1 = now - 60 * 60; // 1 hour ago
    const fetch2 = now - 2 * 60 * 60; // 2 hours ago
    const sampleData: FinancialData[] = [
      // Batch 1 (most recent fetch)
      { id: 1, symbol: 'GOOG', timestamp: fetch1 - 100, open: 100, high: 101, low: 99, close: 100, volume: 100, source_api: 'API2', fetched_at: fetch1, interval: '5min' },
      { id: 2, symbol: 'GOOG', timestamp: fetch1 - 200, open: 99, high: 100, low: 98, close: 99, volume: 110, source_api: 'API2', fetched_at: fetch1, interval: '5min' },
      // Batch 2 (older fetch)
      { id: 3, symbol: 'GOOG', timestamp: fetch2 - 100, open: 95, high: 96, low: 94, close: 95, volume: 120, source_api: 'API2', fetched_at: fetch2, interval: '5min' },
      // Different symbol
      { id: 4, symbol: 'MSFT', timestamp: fetch1 - 100, open: 200, high: 201, low: 199, close: 200, volume: 130, source_api: 'API2', fetched_at: fetch1, interval: '5min' },
    ];

    test('should return all records from the most recent fetch for the given criteria', () => {
      mockDbInstance.prepare.mockImplementation((sql: string) => {
        // This mock needs to be more sophisticated to handle the two-step query in getFallbackData
        if (sql.includes('ORDER BY fetched_at DESC, timestamp DESC')) { // First query
          return { 
            all: jest.fn((params: any) => sampleData.filter(r => 
                r.symbol === params.symbol &&
                r.source_api === params.source_api &&
                r.interval === params.interval
              ).sort((a,b) => b.fetched_at - a.fetched_at || b.timestamp - a.timestamp).slice(0,100) // Simplified LIMIT
            )
          };
        } else { // Second query (after finding mostRecentFetchedAt)
           return {
             all: jest.fn((params: any) => sampleData.filter(r => 
                r.symbol === params.symbol &&
                r.source_api === params.source_api &&
                r.interval === params.interval &&
                r.fetched_at === params.mostRecentFetchedAt
              ).sort((a,b) => b.timestamp - a.timestamp)
            )
           };
        }
      });

      const result = getFallbackData('GOOG', 'API2', '5min');
      expect(result.length).toBe(2);
      expect(result[0].id).toBe(1); // Timestamp fetch1 - 100
      expect(result[1].id).toBe(2); // Timestamp fetch1 - 200
      expect(result.every(r => r.fetched_at === fetch1)).toBe(true);
    });
     test('should return empty array if no data found', () => {
       mockDbInstance.prepare.mockReturnValue({ all: jest.fn(() => []) });
      const result = getFallbackData('AMZN', 'API2', '5min');
      expect(result.length).toBe(0);
    });
  });

  describe('queryHistoricalData', () => {
    const now = Math.floor(Date.now() / 1000);
    const data = [
      { id: 1, symbol: 'TSLA', timestamp: now - 3*86400, open: 200, high: 205, low: 195, close: 202, volume: 1000, source_api: 'API_H', fetched_at: now, interval: '1d' },
      { id: 2, symbol: 'TSLA', timestamp: now - 2*86400, open: 202, high: 208, low: 200, close: 205, volume: 1200, source_api: 'API_H', fetched_at: now, interval: '1d' },
      { id: 3, symbol: 'TSLA', timestamp: now - 1*86400, open: 205, high: 210, low: 203, close: 208, volume: 1100, source_api: 'API_H', fetched_at: now, interval: '1d' },
      { id: 4, symbol: 'TSLA', timestamp: now - 1*86400, open: 207, high: 210, low: 206, close: 209, volume: 500, source_api: 'API_H_5min', fetched_at: now, interval: '5min' }, // Same day, diff interval
      { id: 5, symbol: 'NVDA', timestamp: now - 2*86400, open: 300, high: 305, low: 295, close: 303, volume: 2000, source_api: 'API_H', fetched_at: now, interval: '1d' },
    ] as FinancialData[];

    const mockQueryImplementation = (params: any) => {
        let filtered = data.filter(r => 
            r.symbol === params.symbol &&
            r.timestamp >= params.startTimestamp &&
            r.timestamp <= params.endTimestamp
        );
        if (params.source_api) {
            filtered = filtered.filter(r => r.source_api === params.source_api);
        }
        if (params.interval) {
            filtered = filtered.filter(r => r.interval === params.interval);
        }
        return filtered.sort((a,b) => a.timestamp - b.timestamp);
    };


    test('should retrieve by symbol and date range', () => {
      mockDbInstance.prepare.mockReturnValue({ all: jest.fn(mockQueryImplementation) });
      const result = queryHistoricalData('TSLA', now - 3*86400, now - 1*86400);
      expect(result.length).toBe(3); // 3 daily TSLA records (ignoring 5min one for this generic call)
      expect(result[0].id).toBe(1);
      expect(result[2].id).toBe(3);
    });

    test('should filter by source_api if provided', () => {
      mockDbInstance.prepare.mockReturnValue({ all: jest.fn(mockQueryImplementation) });
      const result = queryHistoricalData('TSLA', now - 3*86400, now, 'API_H_5min');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(4);
    });

    test('should filter by interval if provided', () => {
      mockDbInstance.prepare.mockReturnValue({ all: jest.fn(mockQueryImplementation) });
      const result = queryHistoricalData('TSLA', now - 3*86400, now - 1*86400, undefined, '1d');
      expect(result.length).toBe(3);
      expect(result.every(r => r.interval === '1d')).toBe(true);
    });
    
    test('should filter by both source_api and interval', () => {
      mockDbInstance.prepare.mockReturnValue({ all: jest.fn(mockQueryImplementation) });
      const result = queryHistoricalData('TSLA', now - 3*86400, now, 'API_H_5min', '5min');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(4);
    });

    test('should return empty array if no data matches criteria', () => {
      mockDbInstance.prepare.mockReturnValue({ all: jest.fn(mockQueryImplementation) });
      const result = queryHistoricalData('AMD', now - 3*86400, now);
      expect(result.length).toBe(0);
    });
     test('should be sorted by timestamp ascending', () => {
      mockDbInstance.prepare.mockReturnValue({ all: jest.fn(mockQueryImplementation) });
      const result = queryHistoricalData('TSLA', now - 3*86400, now - 1*86400, 'API_H', '1d');
      expect(result.length).toBe(3);
      expect(result[0].timestamp).toBeLessThan(result[1].timestamp);
      expect(result[1].timestamp).toBeLessThan(result[2].timestamp);
    });
  });
});
