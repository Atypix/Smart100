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
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
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
} from '../../src/services/dataService';
import {
  insertData as mockInsertData,
  getRecentData as mockGetRecentData,
  getFallbackData as mockGetFallbackData,
  queryHistoricalData as mockQueryHistoricalData,
} from '../../src/database'; // Mocked functions
import type { FinancialData } from '../../src/database'; // Import type for mock data
import { logger } from '../../src/utils/logger'; // Mocked logger

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
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Using cached data records for IBM'));
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
      expect(mockInsertData).toHaveBeenCalledWith(
        expect.arrayContaining(correspondingFinancialData.map(d => expect.objectContaining({ ...d, id: undefined, fetched_at: expect.any(Number) })))
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully stored 2 records'));
    });

    test('API Error & Fallback: should use fallback if API fails and fallback exists', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));
      (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData); // Fallback data
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(mockGetFallbackData).toHaveBeenCalledWith(symbol, source_api, interval);
      expect(result).toEqual(expectedTransformedOutput); // Transformed from fallback
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('API call failed for IBM'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Using fallback data records for IBM'));
    });
    
    test('API Error & Fallback: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));
      (mockGetFallbackData as jest.Mock).mockReturnValue([]); // No fallback
      await expect(fetchAlphaVantageData(symbol, apiKey)).rejects.toThrow('API fetch failed and no fallback data available');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API fetch failed for IBM (Axios error fetching Alpha Vantage data for IBM: Network Error) and no fallback data available.'));
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
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Using cached data records for AAPL'));
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
      expect(mockInsertData).toHaveBeenCalledWith(
         expect.arrayContaining(correspondingFinancialData.map(d => expect.objectContaining({ ...d, id: undefined, fetched_at: expect.any(Number) })))
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully stored 2 records'));
    });

    test('API Error & Fallback: should use fallback if API fails and fallback exists', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockYahooHistorical.mockRejectedValue(new Error('Yahoo Network Error'));
      (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData);
      const result = await fetchYahooFinanceData(symbol);
      expect(mockGetFallbackData).toHaveBeenCalledWith(symbol, source_api_yahoo, interval_yahoo);
      expect(result).toEqual(expectedTransformedOutput); // Transformed from fallback
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Yahoo API call failed for AAPL'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Using fallback data records for AAPL'));
    });

    test('API Error & Fallback: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockYahooHistorical.mockRejectedValue(new Error('Yahoo Network Error'));
      (mockGetFallbackData as jest.Mock).mockReturnValue([]);
      await expect(fetchYahooFinanceData(symbol)).rejects.toThrow('Yahoo API fetch failed for AAPL (Error fetching data for symbol AAPL from Yahoo Finance API. Details: Yahoo Network Error) and no fallback data available.');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('and no fallback data available.'));
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
      ...dbRow, // Includes all fields from FinancialData
      date: new Date(dbRow.timestamp * 1000), // Plus the 'date' field
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
});
