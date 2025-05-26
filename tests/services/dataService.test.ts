// Mock dependencies
jest.mock('../../src/database', () => ({
  insertData: jest.fn(),
  getRecentData: jest.fn(),
  getFallbackData: jest.fn(),
  queryHistoricalData: jest.fn(),
  // Ensure FinancialData type is available for mock setups if needed,
  // but it's usually imported from the actual module for type correctness.
}));
jest.mock('axios');
// Correctly mock yahoo-finance2, assuming 'historical' is a named export or part of default
const mockYahooHistorical = jest.fn();
jest.mock('yahoo-finance2', () => ({
  __esModule: true, // For ES Modules
  default: { // If yahooFinance.historical is used
    historical: mockYahooHistorical,
  },
  // If import { historical } from 'yahoo-finance2' is used:
  // historical: mockYahooHistorical, 
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  __esModule: true, // Indicate it's an ES Module
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

import axios from 'axios';
import yahooFinance from 'yahoo-finance2'; // This will be the mocked version
import {
  fetchAlphaVantageData,
  fetchYahooFinanceData,
  fetchHistoricalDataFromDB,
  TimeSeriesData, // For AlphaVantage output
  // CandlestickData, // Part of TimeSeriesData
  YahooFinanceData, // For YahooFinance output
  HistoricalDataPoint, // For DB output
  KlineData, // For Binance output
  fetchBinanceData,
} from '../../src/services/dataService';
import {
  insertData as mockInsertData,
  getRecentData as mockGetRecentData,
  getFallbackData as mockGetFallbackData,
  queryHistoricalData as mockQueryHistoricalData,
} from '../../src/database'; // Mocked functions
import type { FinancialData } from '../../src/database'; // Import type for mock data
import logger from '../../src/utils/logger'; // Corrected import, Mocked logger

// Typedef for mocked axios
const mockedAxios = axios as jest.Mocked<typeof axios>;
// Typedef for mocked yahooFinance.historical
// This depends on how yahoo-finance2 is structured and imported.
// If it's `import yahooFinance from 'yahoo-finance2'`, then `yahooFinance.default.historical` (if historical is on default export)
// or `(yahooFinance as any).historical` if it's a direct property.
// Given the mock structure, `mockYahooHistorical` is the direct mock function.


describe('Data Service Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  // --- fetchAlphaVantageData Tests ---
  describe('fetchAlphaVantageData', () => {
    const symbol = 'IBM';
    const apiKey = 'TEST_API_KEY';
    const interval = '5min';
    const source_api = 'AlphaVantage';
    const nowEpoch = Math.floor(Date.now() / 1000);

    const mockApiTimeSeries = {
      "2023-10-27 16:00:00": { "1. open": "150.00", "2. high": "152.00", "3. low": "149.00", "4. close": "151.00", "5. volume": "10000" },
      "2023-10-27 15:55:00": { "1. open": "149.50", "2. high": "150.50", "3. low": "149.00", "4. close": "150.00", "5. volume": "8000" },
    };
    const correspondingFinancialData: FinancialData[] = [
      { symbol: symbol, timestamp: Math.floor(new Date("2023-10-27 16:00:00").getTime()/1000), open: 150, high: 152, low: 149, close: 151, volume: 10000, source_api: source_api, fetched_at: nowEpoch, interval: interval, id: 1 },
      { symbol: symbol, timestamp: Math.floor(new Date("2023-10-27 15:55:00").getTime()/1000), open: 149.50, high: 150.50, low: 149, close: 150, volume: 8000, source_api: source_api, fetched_at: nowEpoch, interval: interval, id: 2 },
    ];
    const expectedTransformedOutput: TimeSeriesData = {
      symbol: symbol,
      interval: interval,
      timeSeries: [ // Sorted descending by timestamp string
        { timestamp: "2023-10-27 16:00:00", open: 150, high: 152, low: 149, close: 151, volume: 10000 },
        { timestamp: "2023-10-27 15:55:00", open: 149.50, high: 150.50, low: 149, close: 150, volume: 8000 },
      ],
    };

    test('Caching: should return cached data if getRecentData returns fresh data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue(correspondingFinancialData);
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(mockGetRecentData).toHaveBeenCalledWith(symbol, source_api, interval, expect.any(Number));
      expect(result).toEqual(expectedTransformedOutput);
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${correspondingFinancialData.length} cached data records for ${symbol}`));
    });

    test('Caching: should call axios.get if getRecentData returns stale/no data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]); // Stale/no data
      mockedAxios.get.mockResolvedValue({ data: { [`Time Series (${interval})`]: mockApiTimeSeries } });
      await fetchAlphaVantageData(symbol, apiKey);
      expect(mockGetRecentData).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    test('API Success & Storage: should fetch, transform, store, and return data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockedAxios.get.mockResolvedValue({ data: { [`Time Series (${interval})`]: mockApiTimeSeries } });
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(result).toEqual(expectedTransformedOutput);
      // Use correspondingFinancialData which is already FinancialData[] and matches what insertData would receive,
      // ensuring id is undefined as it's DB generated.
      expect(mockInsertData).toHaveBeenCalledWith(
        expect.arrayContaining(correspondingFinancialData.map(d => expect.objectContaining({ 
          ...d, 
          id: undefined, 
          fetched_at: expect.any(Number) 
        })))
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully stored ${correspondingFinancialData.length} records`));
    });

    test('API Error & Fallback: should use fallback if API fails and fallback exists', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Network Error'); // Use a generic error for this path
      mockedAxios.get.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData); // Fallback data
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(mockGetFallbackData).toHaveBeenCalledWith(symbol, source_api, interval);
      expect(result).toEqual(expectedTransformedOutput); // Transformed from fallback
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`API call failed for ${symbol}`));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${correspondingFinancialData.length} fallback data records for ${symbol}`));
    });
    
    test('API Error & Fallback: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Network Error'); // Generic error
      mockedAxios.get.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue([]); // No fallback
      // Construct expected error message based on a generic error being passed to handleApiErrorAndFetchFallback
      const expectedApiErrorMsg = `Generic error processing Alpha Vantage data for ${symbol}: ${mockError.message}`;
      const expectedErrorMessage = `API fetch failed for ${symbol} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchAlphaVantageData(symbol, apiKey)).rejects.toThrow(expectedErrorMessage);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(expectedErrorMessage));
    });

    test('Data Transformation: API error message (e.g. "Error Message") should trigger fallback', async () => {
        (mockGetRecentData as jest.Mock).mockReturnValue([]);
        mockedAxios.get.mockResolvedValue({ data: { 'Error Message': 'Invalid API Key' } });
        (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData);
        const result = await fetchAlphaVantageData(symbol, apiKey);
        expect(mockGetFallbackData).toHaveBeenCalledTimes(1);
        expect(result).toEqual(expectedTransformedOutput);
        expect(logger.error).toHaveBeenCalledWith("Alpha Vantage API Error for IBM: Invalid API Key");
    });
     test('Data Transformation: API information message (e.g. rate limit) should trigger fallback', async () => {
        (mockGetRecentData as jest.Mock).mockReturnValue([]);
        mockedAxios.get.mockResolvedValue({ data: { 'Information': 'Rate limit hit.' } });
        (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData);
        const result = await fetchAlphaVantageData(symbol, apiKey);
        expect(mockGetFallbackData).toHaveBeenCalledTimes(1);
        expect(result).toEqual(expectedTransformedOutput);
        expect(logger.error).toHaveBeenCalledWith("Alpha Vantage API Error for IBM: Rate limit hit.");
    });
  });

  // --- fetchYahooFinanceData Tests ---
  describe('fetchYahooFinanceData', () => {
    const symbol = 'AAPL';
    const source_api_yahoo = 'YahooFinance';
    const interval_yahoo = '1d';
    const now = new Date();
    const nowEpoch = Math.floor(now.getTime() / 1000);

    const mockApiOutput: YahooFinanceData[] = [ // Raw from yahooFinance.historical
      { date: new Date('2023-10-26T00:00:00.000Z'), open: 170, high: 172, low: 169, close: 171, volume: 50000 },
      { date: new Date('2023-10-25T00:00:00.000Z'), open: 172, high: 173, low: 171, close: 172, volume: 60000 },
    ];
     // Data as it would be stored in DB (transformed)
    const correspondingFinancialData: FinancialData[] = mockApiOutput.map(item => ({
      id: expect.any(Number), // Or remove if not comparing id
      symbol: symbol,
      timestamp: Math.floor(item.date.getTime() / 1000),
      open: item.open, high: item.high, low: item.low, close: item.close, volume: item.volume,
      source_api: source_api_yahoo, fetched_at: nowEpoch, interval: interval_yahoo,
    }));
    // Expected output from fetchYahooFinanceData (matches API output structure, sorted)
    const expectedTransformedOutput: YahooFinanceData[] = [...mockApiOutput].sort((a,b) => b.date.getTime() - a.date.getTime());


    test('Caching: should return cached data if getRecentData returns fresh data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue(correspondingFinancialData);
      const result = await fetchYahooFinanceData(symbol);
      expect(mockGetRecentData).toHaveBeenCalledWith(symbol, source_api_yahoo, interval_yahoo, expect.any(Number));
      expect(result).toEqual(expectedTransformedOutput); // Transformed from FinancialData to YahooFinanceData
      expect(mockYahooHistorical).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${correspondingFinancialData.length} cached data records for ${symbol}`));
    });

    test('Caching: should call yahooFinance.historical if getRecentData returns stale/no data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockYahooHistorical.mockResolvedValue(mockApiOutput);
      await fetchYahooFinanceData(symbol);
      expect(mockGetRecentData).toHaveBeenCalledTimes(1);
      expect(mockYahooHistorical).toHaveBeenCalledTimes(1);
    });

    test('API Success & Storage: should fetch, transform, store, and return data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockYahooHistorical.mockResolvedValue(mockApiOutput);
      const result = await fetchYahooFinanceData(symbol);
      expect(result).toEqual(expectedTransformedOutput);
      // Use correspondingFinancialData, ensuring id is undefined
      expect(mockInsertData).toHaveBeenCalledWith(
         expect.arrayContaining(correspondingFinancialData.map(d => expect.objectContaining({ 
           ...d, 
           id: undefined, 
           fetched_at: expect.any(Number) 
          })))
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully stored ${correspondingFinancialData.length} records`));
    });

    test('API Error & Fallback: should use fallback if API fails and fallback exists', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Yahoo Network Error'); // Generic error
      mockYahooHistorical.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData);
      const result = await fetchYahooFinanceData(symbol);
      expect(mockGetFallbackData).toHaveBeenCalledWith(symbol, source_api_yahoo, interval_yahoo);
      expect(result).toEqual(expectedTransformedOutput); // Transformed from fallback
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Yahoo API call failed for ${symbol}`));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${correspondingFinancialData.length} fallback data records for ${symbol}`));
    });

    test('API Error & Fallback: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Yahoo Network Error'); // Generic error
      mockYahooHistorical.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue([]);
      // Construct expected error message based on a generic error
      const expectedApiErrorMsg = `Error fetching data for symbol ${symbol} from Yahoo Finance API. Details: ${mockError.message}`;
      const expectedErrorMessage = `Yahoo API fetch failed for ${symbol} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchYahooFinanceData(symbol)).rejects.toThrow(expectedErrorMessage);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(expectedErrorMessage));
    });

    test('Data Transformation: ensure correct transformation from API to YahooFinanceData[] and FinancialData to YahooFinanceData[]', async () => {
      // API to YahooFinanceData[] is direct, just sorting.
      // FinancialData to YahooFinanceData[] involves new Date(timestamp*1000)
      (mockGetRecentData as jest.Mock).mockReturnValue(correspondingFinancialData);
      let result = await fetchYahooFinanceData(symbol);
      expect(result[0].date).toEqual(new Date(correspondingFinancialData[0].timestamp * 1000)); // Check date transformation

      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockYahooHistorical.mockResolvedValue(mockApiOutput);
      result = await fetchYahooFinanceData(symbol);
      expect(result).toEqual(expectedTransformedOutput); // Check API output transformation (sorting)
    });
  });

  // --- fetchHistoricalDataFromDB Tests ---
  describe('fetchHistoricalDataFromDB', () => {
    const symbol = 'MSFT';
    const startDate = new Date('2023-01-01T00:00:00.000Z');
    const endDate = new Date('2023-01-05T00:00:00.000Z');
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const mockDbResponse: FinancialData[] = [
      { id: 1, symbol: symbol, timestamp: startTimestamp + 86400, open: 200, high: 202, low: 199, close: 201, volume: 100, source_api: 'DB', fetched_at: startTimestamp, interval: '1d' },
      { id: 2, symbol: symbol, timestamp: startTimestamp + (2*86400), open: 201, high: 203, low: 200, close: 202, volume: 110, source_api: 'DB', fetched_at: startTimestamp, interval: '1d' },
    ];
    const expectedTransformedResult: HistoricalDataPoint[] = mockDbResponse.map(dbRow => ({
      // Select only properties belonging to HistoricalDataPoint
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

    test('should call queryHistoricalData and transform results', async () => {
      (mockQueryHistoricalData as jest.Mock).mockReturnValue(mockDbResponse);
      const result = await fetchHistoricalDataFromDB(symbol, startDate, endDate, 'DB_Source', '1d_interval');
      expect(mockQueryHistoricalData).toHaveBeenCalledWith(symbol, startTimestamp, endTimestamp, 'DB_Source', '1d_interval');
      expect(result).toEqual(expectedTransformedResult);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully fetched ${expectedTransformedResult.length} historical data points`));
    });

    test('should return empty array if queryHistoricalData returns empty', async () => {
      (mockQueryHistoricalData as jest.Mock).mockReturnValue([]);
      const result = await fetchHistoricalDataFromDB(symbol, startDate, endDate);
      expect(result).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No historical data found in DB'));
    });
    
    test('should handle optional source_api and interval parameters', async () => {
      (mockQueryHistoricalData as jest.Mock).mockReturnValue(mockDbResponse);
      // Call without optional params
      await fetchHistoricalDataFromDB(symbol, startDate, endDate);
      expect(mockQueryHistoricalData).toHaveBeenCalledWith(symbol, startTimestamp, endTimestamp, undefined, undefined);
      
      // Call with only source_api
      await fetchHistoricalDataFromDB(symbol, startDate, endDate, 'TestSource');
      expect(mockQueryHistoricalData).toHaveBeenCalledWith(symbol, startTimestamp, endTimestamp, 'TestSource', undefined);

      // Call with only interval
       await fetchHistoricalDataFromDB(symbol, startDate, endDate, undefined, 'TestInterval');
      expect(mockQueryHistoricalData).toHaveBeenCalledWith(symbol, startTimestamp, endTimestamp, undefined, 'TestInterval');
    });

    test('should throw error if queryHistoricalData throws', async () => {
      const error = new Error('DB query failed');
      (mockQueryHistoricalData as jest.Mock).mockImplementation(() => { throw error; });
      await expect(fetchHistoricalDataFromDB(symbol, startDate, endDate)).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching historical data from DB'), expect.objectContaining({ error }));
    });
  });

  // --- fetchBinanceData Tests ---
  describe('fetchBinanceData', () => {
    const symbol = 'BTCUSDT';
    const interval = '1h';
    const source_api_binance = 'Binance';
    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    const nowMilliseconds = nowEpochSeconds * 1000;

    // Raw API data: [openTime, open, high, low, close, volume, ...]
    const mockApiKlines: any[][] = [
      [nowMilliseconds - 3600000, "60000.0", "60500.0", "59800.0", "60200.0", "1000"], // 1 hour ago
      [nowMilliseconds - 7200000, "59500.0", "60000.0", "59300.0", "59800.0", "1200"], // 2 hours ago
    ];

    const expectedKlineDataOutput: KlineData[] = mockApiKlines.map(k => ({
      timestamp: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })).sort((a,b) => a.timestamp - b.timestamp); // Ensure ascending order as per implementation

    const correspondingFinancialData: FinancialData[] = expectedKlineDataOutput.map(kline => ({
      id: expect.any(Number), // Or remove if not comparing id
      symbol: symbol.toUpperCase(),
      timestamp: Math.floor(kline.timestamp / 1000), // DB stores in seconds
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      source_api: source_api_binance,
      fetched_at: nowEpochSeconds, // Should be close to this
      interval: interval,
    }));

    test('Successful Fetch & Transform: should fetch, transform, and return data without time params', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]); // No cache
      mockedAxios.get.mockResolvedValue({ data: mockApiKlines });

      const result = await fetchBinanceData(symbol, interval);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/klines',
        { params: { symbol: symbol.toUpperCase(), interval: interval } }
      );
      expect(result).toEqual(expectedKlineDataOutput);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully fetched and transformed ${expectedKlineDataOutput.length} K-line data points`));
    });

    test('Successful Fetch & Transform: should fetch with startTime and endTime', async () => {
      const startTime = nowMilliseconds - 86400000; // 1 day ago
      const endTime = nowMilliseconds;
      (mockGetRecentData as jest.Mock).mockReturnValue([]); // Cache check won't run
      mockedAxios.get.mockResolvedValue({ data: mockApiKlines });

      await fetchBinanceData(symbol, interval, startTime, endTime);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/klines',
        { params: { symbol: symbol.toUpperCase(), interval: interval, startTime: startTime, endTime: endTime } }
      );
       expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Specific time range provided for ${symbol.toUpperCase()}`));
    });
    
    test('Caching Hit: should return cached data if getRecentData returns fresh data (no time params)', async () => {
      // Timestamps in DB are seconds, transformDbRecordToKlineData converts to ms
      const cachedDbData = correspondingFinancialData.map(fd => ({...fd, timestamp: fd.timestamp }));
      (mockGetRecentData as jest.Mock).mockReturnValue(cachedDbData);
      
      const result = await fetchBinanceData(symbol, interval);
      
      expect(mockGetRecentData).toHaveBeenCalledWith(symbol.toUpperCase(), source_api_binance, interval, expect.any(Number));
      // transformDbRecordToKlineData converts DB seconds to API milliseconds
      expect(result).toEqual(expectedKlineDataOutput.map(k => ({...k, timestamp: k.timestamp})));
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${cachedDbData.length} cached data records`));
    });

    test('Caching Miss & Archive: should call API if no recent cache, then archive data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]); // Cache miss
      mockedAxios.get.mockResolvedValue({ data: mockApiKlines });

      await fetchBinanceData(symbol, interval);

      expect(mockGetRecentData).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      // correspondingFinancialData is already setup to match FinancialData structure for DB.
      // Ensure it's ordered like expectedKlineDataOutput if order matters for arrayContaining's deep equality.
      // The service sorts klines ascending before preparing for DB.
      const expectedDataForDbInsert = expectedKlineDataOutput.map(kline => ({
        symbol: symbol.toUpperCase(),
        timestamp: Math.floor(kline.timestamp / 1000),
        open: kline.open,
        high: kline.high,
        low: kline.low,
        close: kline.close,
        volume: kline.volume,
        source_api: source_api_binance,
        interval: interval,
        id: undefined, // id is not passed to insertData
        fetched_at: expect.any(Number),
      }));
      expect(mockInsertData).toHaveBeenCalledWith(
        expect.arrayContaining(expectedDataForDbInsert.map(d => expect.objectContaining(d)))
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Attempting to store ${expectedKlineDataOutput.length} records`));
    });

    test('Caching Bypass: should call API directly if startTime is provided, even if cache exists', async () => {
      const startTime = nowMilliseconds - 3600000; // 1 hour ago
      // Ensure correspondingFinancialData has concrete fetched_at for this test's cache mock
      const dbDataForCache = correspondingFinancialData.map(fd => ({...fd, fetched_at: nowEpochSeconds}));
      (mockGetRecentData as jest.Mock).mockReturnValue(dbDataForCache); 
      mockedAxios.get.mockResolvedValue({ data: mockApiKlines }); // API response

      await fetchBinanceData(symbol, interval, startTime);
      
      expect(mockGetRecentData).not.toHaveBeenCalled(); // Cache is bypassed
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Specific time range provided for ${symbol.toUpperCase()}`));
    });

    test('API Error & Fallback Hit: should use fallback if API fails and fallback exists', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]); // No cache
      const mockError = new Error('Simulated Binance API Network Error'); // Generic error
      mockedAxios.get.mockRejectedValue(mockError);
      
      const fallbackDbDataSecondsTs = correspondingFinancialData.map(fd => ({...fd, fetched_at: nowEpochSeconds}));
      (mockGetFallbackData as jest.Mock).mockReturnValue(fallbackDbDataSecondsTs);

      const result = await fetchBinanceData(symbol, interval);
      
      expect(mockGetFallbackData).toHaveBeenCalledWith(symbol.toUpperCase(), source_api_binance, interval);
      
      const expectedResultFromFallback: KlineData[] = fallbackDbDataSecondsTs.map(dbData => ({
        timestamp: dbData.timestamp * 1000, 
        open: dbData.open, high: dbData.high, low: dbData.low, close: dbData.close, volume: dbData.volume,
      })).sort((a,b) => a.timestamp - b.timestamp); 

      expect(result).toEqual(expectedResultFromFallback);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Binance API call failed'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${fallbackDbDataSecondsTs.length} fallback data records`));
    });
    
    test('API Error & Fallback Hit (with time range): should filter fallback data', async () => {
      const startTime = nowMilliseconds - 3600000 * 1.5; 
      const endTime = nowMilliseconds - 3600000 * 0.5;   
      
      (mockGetRecentData as jest.Mock).mockReturnValue([]); 
      const mockError = new Error('Simulated Binance API Network Error');
      mockedAxios.get.mockRejectedValue(mockError);
      
      const fallbackDbDataAllSecondsTs = correspondingFinancialData.map(fd => ({...fd, fetched_at: nowEpochSeconds}));
      (mockGetFallbackData as jest.Mock).mockReturnValue(fallbackDbDataAllSecondsTs);

      const result = await fetchBinanceData(symbol, interval, startTime, endTime);
      
      expect(mockGetFallbackData).toHaveBeenCalledWith(symbol.toUpperCase(), source_api_binance, interval);
      
      const expectedFilteredOutput = expectedKlineDataOutput.filter(k => k.timestamp >= startTime && k.timestamp <= endTime);
      
      expect(result).toEqual(expectedFilteredOutput);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Binance API call failed'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${fallbackDbDataAllSecondsTs.length} fallback data records`)); 
    });

    test('API Error & Fallback Miss: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Binance API Network Error'); // Generic error
      mockedAxios.get.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue([]); // No fallback
      
      // Construct expected error message based on a generic error
      const expectedApiErrorMsg = `Generic error processing Binance data for ${symbol.toUpperCase()}: ${mockError.message}`;
      const expectedErrorMessage = `Binance API fetch failed for ${symbol.toUpperCase()} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchBinanceData(symbol, interval)).rejects.toThrow(expectedErrorMessage);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(expectedErrorMessage));
    });

    test('API Malformed Response: should attempt fallback if API returns non-array', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockedAxios.get.mockResolvedValue({ data: { message: "Not an array" } }); // Malformed
      (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData); // Has fallback

      const result = await fetchBinanceData(symbol, interval);
      expect(logger.error).toHaveBeenCalledWith('Binance API did not return an array for klines', expect.anything());
      expect(mockGetFallbackData).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedKlineDataOutput);
    });
  });
});
