import Database from 'better-sqlite3';

// Initialize database connection
let db: Database.Database;
const dbFilePath = process.env.NODE_ENV === 'test' ? ':memory:' : 'trading_data.db';

try {
  db = new Database(dbFilePath);
  if (process.env.NODE_ENV === 'test') {
    console.log('Connected to in-memory SQLite database for testing.');
  } else {
    console.log('Connected to the SQLite database (trading_data.db).');
  }
} catch (error) {
  console.error('Error connecting to the database:', error);
  // Depending on the application's needs, you might want to exit the process
  // or handle this error in a way that allows the application to continue
  // in a degraded state.
  process.exit(1); // Exiting if DB connection is critical
}

// Function to initialize the database schema
function initializeSchema(): void {
  try {
    // Create the financial_data table if it doesn't exist
    db.exec(`
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

    // Create indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_symbol ON financial_data (symbol);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON financial_data (timestamp);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_source_api ON financial_data (source_api);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_symbol_timestamp_source_interval ON financial_data (symbol, timestamp, source_api, interval);');

    // Create users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    // Create index on users.email
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);');

    // Create api_keys table
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        exchange_name TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        api_secret_encrypted TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Create indexes on api_keys
    db.exec('CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_api_keys_user_id_exchange_name ON api_keys (user_id, exchange_name);');

    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    // Depending on the application's needs, you might want to exit the process
    // or handle this error in a way that allows the application to continue
    // in a degraded state.
    process.exit(1); // Exiting if schema initialization is critical
  }
}

// Call initializeSchema after the database connection is established
initializeSchema();

// Interface for financial data records
export interface FinancialData {
  id?: number;
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source_api: string;
  fetched_at: number;
  interval: string;
}

// Function to insert multiple financial data records
function insertData(records: FinancialData[]): void {
  if (!db) {
    console.error('[DATABASE CRITICAL] insertData called but db instance is not available!');
    throw new Error('[DATABASE CRITICAL] db instance is not available in insertData.');
  }
  const insert = db.prepare(`
    INSERT INTO financial_data (symbol, timestamp, open, high, low, close, volume, source_api, fetched_at, interval)
    VALUES (@symbol, @timestamp, @open, @high, @low, @close, @volume, @source_api, @fetched_at, @interval)
  `);

  try {
    db.transaction((recs: FinancialData[]) => {
      for (const record of recs) {
        insert.run(record);
      }
    })(records);
    console.log(`Inserted ${records.length} records into financial_data.`);
  } catch (error) {
    console.error('Error inserting data into financial_data:', error);
  }
}

// Function to get recent financial data
function getRecentData(symbol: string, source_api: string, interval: string, threshold_seconds: number): FinancialData[] {
  if (!db) {
    console.error('[DATABASE CRITICAL] getRecentData called but db instance is not available!');
    throw new Error('[DATABASE CRITICAL] db instance is not available in getRecentData.');
  }
  const stmt = db.prepare(`
    SELECT * FROM financial_data
    WHERE symbol = @symbol
      AND source_api = @source_api
      AND interval = @interval
      AND fetched_at >= @threshold_seconds
    ORDER BY timestamp DESC
  `);

  try {
    // Cast the result of stmt.all to FinancialData[]
    return stmt.all({ symbol, source_api, interval, threshold_seconds }) as FinancialData[];
  } catch (error) {
    console.error('Error fetching recent data from financial_data:', error);
    return [];
  }
}

// Function to get the most recent fallback data
function getFallbackData(symbol: string, source_api: string, interval: string): FinancialData[] {
  if (!db) {
    console.error('[DATABASE CRITICAL] getFallbackData called but db instance is not available!');
    throw new Error('[DATABASE CRITICAL] db instance is not available in getFallbackData.');
  }
  try {
    const stmt = db.prepare(`
      SELECT * FROM financial_data
      WHERE symbol = @symbol
        AND source_api = @source_api
        AND interval = @interval
      ORDER BY fetched_at DESC, timestamp DESC 
      LIMIT 100;
    `);

    const results = stmt.all({ symbol, source_api, interval }) as FinancialData[];
    
    if (results && results.length > 0) {
        const mostRecentFetchedAt = results[0].fetched_at;
        const finalResultsStmt = db.prepare(`
            SELECT * FROM financial_data
            WHERE symbol = @symbol
              AND source_api = @source_api
              AND interval = @interval
              AND fetched_at = @mostRecentFetchedAt
            ORDER BY timestamp DESC
        `);
        const finalResults = finalResultsStmt.all({symbol, source_api, interval, mostRecentFetchedAt}) as FinancialData[];
        return finalResults;
    }
    return []; 
  } catch (error) { 
    // console.log('[DEBUG DATABASE] getFallbackData: INNER CATCH BLOCK ENTERED. Error:', error); // Remove this debug log
    console.error('Error fetching fallback data from financial_data:', error); 
    throw error; // Re-throw the error
  }
}


// Function to query historical data
function queryHistoricalData(
  symbol: string,
  startTimestamp: number,
  endTimestamp: number,
  source_api?: string,
  interval?: string
): FinancialData[] {
  if (!db) {
    console.error('[DATABASE CRITICAL] queryHistoricalData called but db instance is not available!');
    throw new Error('[DATABASE CRITICAL] db instance is not available in queryHistoricalData.');
  }
  let sql = 'SELECT * FROM financial_data WHERE symbol = @symbol AND timestamp >= @startTimestamp AND timestamp <= @endTimestamp';
  const params: any = { symbol, startTimestamp, endTimestamp };

  if (source_api) {
    sql += ' AND source_api = @source_api';
    params.source_api = source_api;
  }

  if (interval) {
    sql += ' AND interval = @interval';
    params.interval = interval;
  }

  sql += ' ORDER BY timestamp ASC;'; // Order by timestamp ascending

  try {
    const stmt = db.prepare(sql);
    // Cast the result of stmt.all to FinancialData[]
    return stmt.all(params) as FinancialData[];
  } catch (error) {
    console.error('Error querying historical data from financial_data:', error);
    // In a real application, you might want to throw a custom error or handle it differently
    throw error; 
  }
}

// Function to get all unique symbols from financial_data
function getAllUniqueSymbols(): string[] {
  if (!db) {
    console.error('[DATABASE CRITICAL] getAllUniqueSymbols called but db instance is not available!');
    throw new Error('[DATABASE CRITICAL] db instance is not available in getAllUniqueSymbols.');
  }
  try {
    const stmt = db.prepare('SELECT DISTINCT symbol FROM financial_data');
    const rows = stmt.all() as { symbol: string }[]; // Cast rows to expected shape
    return rows.map(row => row.symbol);
  } catch (error) {
    console.error('Error fetching all unique symbols from financial_data:', error);
    // Depending on desired error handling, you might throw or return empty
    throw error; // Or return [];
  }
}

// Export the database instance, schema creation function, and new helper functions
export { db, initializeSchema, insertData, getRecentData, getFallbackData, queryHistoricalData, getAllUniqueSymbols };
