// Mock external dependencies
jest.mock('axios');
const mockYahooHistorical = jest.fn();
jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: {
    historical: mockYahooHistorical,
  },
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import axios from 'axios';
import {
  fetchAlphaVantageData,
  fetchYahooFinanceData,
  fetchHistoricalDataFromDB,
  TimeSeriesData,
  YahooFinanceData,
  HistoricalDataPoint,
  KlineData,
  fetchBinanceData,
} from '../../src/services/dataService';
import {
  db, // Real db instance
  initializeSchema,
  insertData, // Real insertData
  FinancialData,
  getRecentData, // Real getRecentData for verification if needed, though dataService uses its own logic
  getFallbackData, // Real getFallbackData for verification if needed
  queryHistoricalData, // Real queryHistoricalData
} from '../../src/database';
import logger from '../../src/utils/logger';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Data Service Tests (Integration with In-Memory DB)', () => {
  beforeAll(() => {
    // Ensure schema is initialized once for all tests in this file
    // as db connection is established when `../../src/database` is imported.
    // initializeSchema(); // Already called when db module is loaded.
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clean database state before each test
    try {
      db.exec('DELETE FROM financial_data;');
      // Add DELETES for other tables if dataService interacts with them directly or indirectly
    } catch (error) {
      console.error('Error clearing database tables:', error);
      // If tables don't exist, initializeSchema will create them
      initializeSchema();
    }
  });

  describe('fetchAlphaVantageData', () => {
    const symbol = 'IBM';
    const apiKey = 'TEST_API_KEY';
    const interval = '5min'; // Default interval in fetchAlphaVantageData
    const source_api = 'AlphaVantage'; // Default source_api in fetchAlphaVantageData

    const mockApiTimeSeries = {
      '2023-10-27 16:00:00': { '1. open': '150.00', '2. high': '152.00', '3. low': '149.00', '4. close': '151.00', '5. volume': '10000' },
      '2023-10-27 15:55:00': { '1. open': '149.50', '2. high': '150.50', '3. low': '149.00', '4. close': '150.00', '5. volume': '8000' },
    };
    const expectedTransformedOutput: TimeSeriesData = {
      symbol: symbol,
      interval: interval,
      timeSeries: [
        { timestamp: '2023-10-27 16:00:00', open: 150, high: 152, low: 149, close: 151, volume: 10000 },
        { timestamp: '2023-10-27 15:55:00', open: 149.50, high: 150.50, low: 149, close: 150, volume: 8000 },
      ],
    };
    const correspondingFinancialData: FinancialData[] = [
      { symbol: symbol, timestamp: Math.floor(new Date('2023-10-27 16:00:00').getTime() / 1000), open: 150, high: 152, low: 149, close: 151, volume: 10000, source_api: source_api, fetched_at: Math.floor(Date.now() / 1000) - 60, interval: interval }, // fetched 1 min ago
      { symbol: symbol, timestamp: Math.floor(new Date('2023-10-27 15:55:00').getTime() / 1000), open: 149.50, high: 150.50, low: 149, close: 150, volume: 8000, source_api: source_api, fetched_at: Math.floor(Date.now() / 1000) - 60, interval: interval }, // fetched 1 min ago
    ];

    test('Caching: should return cached data if getRecentData returns fresh data', async () => {
      insertData(correspondingFinancialData); // Use real insertData
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(result).toEqual(expectedTransformedOutput);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    test('API Success & Storage: should fetch, transform, store, and return data', async () => {
      mockedAxios.get.mockResolvedValue({ data: { [`Time Series (${interval})`]: mockApiTimeSeries } });
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(result).toEqual(expectedTransformedOutput);

      const dbData = db.prepare('SELECT * FROM financial_data WHERE symbol = ? ORDER BY timestamp DESC').all(symbol) as FinancialData[];
      expect(dbData.length).toBe(2);
      expect(dbData[0].close).toBe(151.00);
      expect(dbData[1].close).toBe(150.00);
    });

    test('API Error & Fallback: should use fallback if API fails and fallback exists', async () => {
      const mockError = new Error('Simulated Network Error');
      mockedAxios.get.mockRejectedValue(mockError);
      // Prepare fallback data in DB
      const fallbackFinancialData = correspondingFinancialData.map(d => ({...d, fetched_at: Math.floor(Date.now()/1000) - 3 * 3600})); // 3 hours old
      insertData(fallbackFinancialData);
      
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(result).toEqual(expectedTransformedOutput); // Assuming fallback data is transformed same way
      
      const expectedApiErrorMessagePart = `Generic error processing Alpha Vantage data for ${symbol}: ${mockError.message}`;
      expect(logger.warn).toHaveBeenCalledWith(
        `API call failed for ${symbol} (${source_api}, ${interval}): ${expectedApiErrorMessagePart}. Attempting to use fallback data.`
      );
    });

    test('API Error & Fallback Miss: should throw if API fails and no fallback', async () => {
      const mockError = new Error('Simulated Network Error');
      mockedAxios.get.mockRejectedValue(mockError);
      // Ensure no data for 'IBM' or specifically no fallback data
      db.exec("DELETE FROM financial_data WHERE symbol = 'IBM';");

      const expectedApiErrorMsg = `Generic error processing Alpha Vantage data for ${symbol}: ${mockError.message}`;
      const expectedErrorMessage = `API fetch failed for ${symbol} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchAlphaVantageData(symbol, apiKey)).rejects.toThrow(expectedErrorMessage);
    });

    test('API Error & Fallback Failure: should throw if API fails and fallback query also fails', async () => {
      const mockApiError = new Error('Simulated API Network Error');
      mockedAxios.get.mockRejectedValue(mockApiError);

      // Simulate a DB error during getFallbackData by temporarily making db inaccessible or corrupting table
      const originalDbExec = db.exec;
      db.exec = jest.fn(() => { throw new Error("Simulated DB error during fallback query"); }) as any;

      const expectedApiErrorMsg = `Generic error processing Alpha Vantage data for ${symbol}: ${mockApiError.message}`;
      const expectedThrownErrorMessage = `API fetch failed for ${symbol} (${expectedApiErrorMsg}), and an error occurred while querying fallback data.`;
      
      await expect(fetchAlphaVantageData(symbol, apiKey)).rejects.toThrow(expectedThrownErrorMessage);
      
      db.exec = originalDbExec; // Restore original exec
    });
  });

  describe('fetchYahooFinanceData', () => {
    const symbol = 'AAPL';
    const source_api_yahoo = 'YahooFinance';
    const interval_yahoo = '1d'; // Default interval in fetchYahooFinanceData

    const mockApiOutput: YahooFinanceData[] = [
      { date: new Date('2023-10-26T00:00:00.000Z'), open: 170, high: 172, low: 169, close: 171, volume: 50000 },
      { date: new Date('2023-10-25T00:00:00.000Z'), open: 172, high: 173, low: 171, close: 172, volume: 60000 },
    ];
     const expectedTransformedOutput: YahooFinanceData[] = [...mockApiOutput].sort((a,b) => b.date.getTime() - a.date.getTime());


    test('API Success & Storage: should fetch, transform, store, and return data', async () => {
      mockYahooHistorical.mockResolvedValue(mockApiOutput);
      const result = await fetchYahooFinanceData(symbol);
      expect(result).toEqual(expectedTransformedOutput);

      const dbData = db.prepare('SELECT * FROM financial_data WHERE symbol = ? ORDER BY timestamp DESC').all(symbol) as FinancialData[];
      expect(dbData.length).toBe(2);
      expect(dbData[0].close).toBe(171);
      expect(dbData[1].close).toBe(172);
    });

    test('API Error & Fallback Miss: should throw if API fails and no fallback', async () => {
      const mockError = new Error('Simulated Yahoo Network Error');
      mockYahooHistorical.mockRejectedValue(mockError);
      db.exec("DELETE FROM financial_data WHERE symbol = 'AAPL';");

      const expectedApiErrorMsg = `Error fetching data for symbol ${symbol} from Yahoo Finance API. Details: ${mockError.message}`;
      const expectedErrorMessage = `Yahoo API fetch failed for ${symbol} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchYahooFinanceData(symbol)).rejects.toThrow(expectedErrorMessage);
    });
    
    test('API Error & Fallback Failure (Yahoo): should throw if API and fallback query fail', async () => {
        const mockApiError = new Error('Simulated Yahoo Network Error');
        mockYahooHistorical.mockRejectedValue(mockApiError);
        
        const originalDbExec = db.exec;
        db.exec = jest.fn(() => { throw new Error("Simulated DB error during Yahoo fallback"); }) as any;

        const expectedApiErrorMsg = `Error fetching data for symbol ${symbol} from Yahoo Finance API. Details: ${mockApiError.message}`;
        const expectedThrownErrorMessage = `Yahoo API fetch failed for ${symbol} (${expectedApiErrorMsg}), and an error occurred while querying fallback data.`;
        
        await expect(fetchYahooFinanceData(symbol)).rejects.toThrow(expectedThrownErrorMessage);
        db.exec = originalDbExec; // Restore
    });
  });

  describe('fetchHistoricalDataFromDB', () => {
    const symbol = 'MSFT';
    const startDate = new Date('2023-01-01T00:00:00.000Z');
    const endDate = new Date('2023-01-05T00:00:00.000Z');
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const dbResponse: FinancialData[] = [
      { symbol: symbol, timestamp: startTimestamp + 86400, open: 200, high: 202, low: 199, close: 201, volume: 100, source_api: 'DB_Source', fetched_at: startTimestamp, interval: '1d_interval' },
      { symbol: symbol, timestamp: startTimestamp + (2*86400), open: 201, high: 203, low: 200, close: 202, volume: 110, source_api: 'DB_Source', fetched_at: startTimestamp, interval: '1d_interval' },
    ];
    const expectedTransformedResult: HistoricalDataPoint[] = dbResponse.map(dbRow => ({
      timestamp: dbRow.timestamp,
      date: new Date(dbRow.timestamp * 1000),
      open: dbRow.open,
      high: dbRow.high,
      low: dbRow.low,
      close: dbRow.close,
      volume: dbRow.volume,
      interval: dbRow.interval,
      source_api: dbRow.source_api,
      symbol: dbRow.symbol,
    }));

    test('should call queryHistoricalDataFromDB and transform results', async () => {
      insertData(dbResponse);
      const result = await fetchHistoricalDataFromDB(symbol, startDate, endDate, 'DB_Source', '1d_interval');
      expect(result).toEqual(expectedTransformedResult);
    });
  });

  describe('fetchBinanceData', () => {
    const symbol = 'BTCUSDT';
    const interval = '1h';
    const source_api_binance = 'Binance';
    const nowMilliseconds = Date.now();

    const mockApiKlines: any[][] = [
      [nowMilliseconds - 7200000, "59500.0", "60000.0", "59300.0", "59800.0", "1200"], // Older
      [nowMilliseconds - 3600000, "60000.0", "60500.0", "59800.0", "60200.0", "1000"], // Newer
    ];

    const expectedKlineDataOutput: KlineData[] = mockApiKlines.map(k => ({
      timestamp: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })).sort((a,b) => a.timestamp - b.timestamp); // Sorted by timestamp ascending

    test('Caching Miss & Archive: should call API if no recent cache, then archive data', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiKlines });
      await fetchBinanceData(symbol, interval);
      
      const dbData = db.prepare('SELECT * FROM financial_data WHERE symbol = ? ORDER BY timestamp ASC').all(symbol.toUpperCase()) as FinancialData[];
      expect(dbData.length).toBe(expectedKlineDataOutput.length);
      dbData.forEach((dbPoint, index) => {
        expect(dbPoint.symbol).toBe(symbol.toUpperCase());
        expect(dbPoint.timestamp).toBe(Math.floor(expectedKlineDataOutput[index].timestamp / 1000));
        expect(dbPoint.open).toBe(expectedKlineDataOutput[index].open);
        // Add other field checks as needed
      });
    });

    test('API Error & Fallback Miss: should throw if API fails and no fallback', async () => {
      const mockError = new Error('Simulated Binance API Network Error');
      mockedAxios.get.mockRejectedValue(mockError);
      db.exec(`DELETE FROM financial_data WHERE symbol = '${symbol.toUpperCase()}';`);
      
      const expectedApiErrorMsg = `Generic error processing Binance data for ${symbol.toUpperCase()}: ${mockError.message}`;
      const expectedErrorMessage = `Binance API fetch failed for ${symbol.toUpperCase()} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchBinanceData(symbol, interval)).rejects.toThrow(expectedErrorMessage);
    });

    test('API Error & Fallback Failure (Binance): should throw if API fails and fallback query also fails', async () => {
        const mockApiError = new Error('Simulated Binance API Network Error');
        mockedAxios.get.mockRejectedValue(mockApiError);
        
        const originalDbExec = db.exec;
        db.exec = jest.fn(() => { throw new Error("Simulated DB error during Binance fallback"); }) as any;

        const expectedApiErrorMsg = `Generic error processing Binance data for ${symbol.toUpperCase()}: ${mockApiError.message}`;
        const expectedThrownErrorMessage = `Binance API fetch failed for ${symbol.toUpperCase()} (${expectedApiErrorMsg}), and an error occurred while querying fallback data.`;
        
        await expect(fetchBinanceData(symbol, interval)).rejects.toThrow(expectedThrownErrorMessage);
        db.exec = originalDbExec; // Restore
    });
  });
});
