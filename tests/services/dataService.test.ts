// Mock dependencies
jest.mock('../../src/database', () => ({
  insertData: jest.fn(),
  getRecentData: jest.fn(),
  getFallbackData: jest.fn(),
  queryHistoricalData: jest.fn(),
}));
jest.mock('axios'); // For AlphaVantage

// Mock binance-api-node
const mockBinanceCandles = jest.fn();
const mockBinanceClient = {
  candles: mockBinanceCandles,
};
jest.mock('binance-api-node', () => ({
  __esModule: true, // For ES Modules
  default: jest.fn(() => mockBinanceClient), // Mock the default export which is the Binance function
}));


// Correctly mock yahoo-finance2
const mockYahooHistorical = jest.fn();
jest.mock('yahoo-finance2', () => ({
  __esModule: true, 
  default: { 
    historical: mockYahooHistorical,
  },
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
// import Binance from 'binance-api-node'; // Actual import not needed due to mock
// import yahooFinance from 'yahoo-finance2'; // Actual import not needed

import {
  fetchAlphaVantageData,
  fetchYahooFinanceData,
  fetchHistoricalDataFromDB,
  fetchBinanceData, // Function to test
  TimeSeriesData, 
  YahooFinanceData, 
  HistoricalDataPoint,
  TransformedBinanceData, // Type for Binance output
} from '../../src/services/dataService';
import {
  insertData as mockInsertData,
  getRecentData as mockGetRecentData,
  getFallbackData as mockGetFallbackData,
  queryHistoricalData as mockQueryHistoricalData,
} from '../../src/database'; // Mocked functions
import type { FinancialData } from '../../src/database'; 
import { logger } from '../../src/utils/logger'; 

const mockedAxios = axios as jest.Mocked<typeof axios>;


describe('Data Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- fetchAlphaVantageData Tests (Keep existing tests, ensure they are not broken) ---
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
      { symbol: symbol, timestamp: Math.floor(new Date("2023-10-27 16:00:00").getTime()/1000), open: 150, high: 152, low: 149, close: 151, volume: 10000, source_api: source_api, fetched_at: nowEpoch, interval: interval, id: 1, quote_asset_volume: undefined, number_of_trades: undefined },
      { symbol: symbol, timestamp: Math.floor(new Date("2023-10-27 15:55:00").getTime()/1000), open: 149.50, high: 150.50, low: 149, close: 150, volume: 8000, source_api: source_api, fetched_at: nowEpoch, interval: interval, id: 2, quote_asset_volume: undefined, number_of_trades: undefined },
    ];
    const expectedTransformedOutput: TimeSeriesData = {
      symbol: symbol,
      interval: interval,
      timeSeries: [ 
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
    });

    test('API Success & Storage: should fetch, transform, store, and return data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockedAxios.get.mockResolvedValue({ data: { [`Time Series (${interval})`]: mockApiTimeSeries } });
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(result).toEqual(expectedTransformedOutput);
      expect(mockInsertData).toHaveBeenCalledWith(
        expect.arrayContaining(correspondingFinancialData.map(d => expect.objectContaining({ ...d, id: undefined, fetched_at: expect.any(Number) })))
      );
    });
  });


  // --- fetchYahooFinanceData Tests (Keep existing tests) ---
  describe('fetchYahooFinanceData', () => {
    const symbol = 'AAPL';
    const source_api_yahoo = 'YahooFinance';
    const interval_yahoo = '1d';
    const now = new Date();
    const nowEpoch = Math.floor(now.getTime() / 1000);

    const mockApiOutput: YahooFinanceData[] = [ 
      { date: new Date('2023-10-26T00:00:00.000Z'), open: 170, high: 172, low: 169, close: 171, volume: 50000 },
      { date: new Date('2023-10-25T00:00:00.000Z'), open: 172, high: 173, low: 171, close: 172, volume: 60000 },
    ];
    const correspondingFinancialData: FinancialData[] = mockApiOutput.map((item,idx) => ({
      id: idx+1, symbol: symbol, timestamp: Math.floor(item.date.getTime() / 1000),
      open: item.open, high: item.high, low: item.low, close: item.close, volume: item.volume,
      source_api: source_api_yahoo, fetched_at: nowEpoch, interval: interval_yahoo,
      quote_asset_volume: undefined, number_of_trades: undefined,
    }));
    const expectedTransformedOutput: YahooFinanceData[] = [...mockApiOutput].sort((a,b) => b.date.getTime() - a.date.getTime());

    test('Caching: should return cached data if getRecentData returns fresh data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue(correspondingFinancialData);
      const result = await fetchYahooFinanceData(symbol);
      expect(mockGetRecentData).toHaveBeenCalledWith(symbol, source_api_yahoo, interval_yahoo, expect.any(Number));
      expect(result).toEqual(expectedTransformedOutput); 
      expect(mockYahooHistorical).not.toHaveBeenCalled();
    });
     test('API Success & Storage: should fetch, transform, store, and return data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockYahooHistorical.mockResolvedValue(mockApiOutput);
      const result = await fetchYahooFinanceData(symbol);
      expect(result).toEqual(expectedTransformedOutput);
      expect(mockInsertData).toHaveBeenCalledWith(
         expect.arrayContaining(correspondingFinancialData.map(d => expect.objectContaining({ ...d, id: undefined, fetched_at: expect.any(Number) })))
      );
    });
  });

  // --- fetchBinanceData Tests ---
  describe('fetchBinanceData', () => {
    const symbol = 'BTCUSDT';
    const interval = '1m'; // CandleChartInterval_LT type
    const source_api_binance = 'Binance';
    const nowEpoch = Math.floor(Date.now() / 1000);

    // Mock API response from client.candles()
    const mockBinanceApiOutput = [
      { openTime: (nowEpoch - 120) * 1000, open: '30000', high: '30100', low: '29900', close: '30050', volume: '10.5', closeTime: (nowEpoch - 60) * 1000 -1 , quoteAssetVolume: '315000', trades: 500, takerBuyBaseAssetVolume: '5.0', takerBuyQuoteAssetVolume: '150000', ignore: '0' },
      { openTime: (nowEpoch - 180) * 1000, open: '29950', high: '30050', low: '29900', close: '30000', volume: '12.3', closeTime: (nowEpoch - 120) * 1000 -1, quoteAssetVolume: '369000', trades: 600, takerBuyBaseAssetVolume: '6.0', takerBuyQuoteAssetVolume: '180000', ignore: '0' },
    ];
    // Expected data after transformation for API return
    const expectedTransformedBinanceOutput: TransformedBinanceData[] = [
      { timestamp: nowEpoch - 120, open: 30000, high: 30100, low: 29900, close: 30050, volume: 10.5 },
      { timestamp: nowEpoch - 180, open: 29950, high: 30050, low: 29900, close: 30000, volume: 12.3 },
    ].sort((a,b) => b.timestamp - a.timestamp); // Sorted descending
    
    // Expected data for database storage (FinancialData format)
    const correspondingFinancialData: FinancialData[] = [
      { id: 1, symbol: symbol, timestamp: nowEpoch - 120, open: 30000, high: 30100, low: 29900, close: 30050, volume: 10.5, source_api: source_api_binance, fetched_at: nowEpoch, interval: interval, quote_asset_volume: 315000, number_of_trades: 500 },
      { id: 2, symbol: symbol, timestamp: nowEpoch - 180, open: 29950, high: 30050, low: 29900, close: 30000, volume: 12.3, source_api: source_api_binance, fetched_at: nowEpoch, interval: interval, quote_asset_volume: 369000, number_of_trades: 600 },
    ];

    test('Caching: should return cached data if getRecentData returns fresh Binance data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue(correspondingFinancialData);
      const result = await fetchBinanceData(symbol, interval as any); // Cast interval for mock
      expect(mockGetRecentData).toHaveBeenCalledWith(symbol, source_api_binance, interval, expect.any(Number));
      expect(result).toEqual(expectedTransformedBinanceOutput); // Transformed from FinancialData
      expect(mockBinanceCandles).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${correspondingFinancialData.length} cached data records for ${symbol}`));
    });

    test('Caching: should call client.candles if getRecentData returns stale/no data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockBinanceCandles.mockResolvedValue(mockBinanceApiOutput);
      await fetchBinanceData(symbol, interval as any);
      expect(mockGetRecentData).toHaveBeenCalledTimes(1);
      expect(mockBinanceCandles).toHaveBeenCalledTimes(1);
    });

    test('API Success & Storage: should fetch, transform, store (with new fields), and return data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockBinanceCandles.mockResolvedValue(mockBinanceApiOutput);
      const result = await fetchBinanceData(symbol, interval as any);
      
      expect(result).toEqual(expectedTransformedBinanceOutput);
      expect(mockInsertData).toHaveBeenCalledWith(
        expect.arrayContaining(
          correspondingFinancialData.map(d => expect.objectContaining({
            // Compare relevant fields, excluding id for insertion
            symbol: d.symbol, timestamp: d.timestamp, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
            source_api: d.source_api, fetched_at: expect.any(Number), interval: d.interval,
            quote_asset_volume: d.quote_asset_volume, number_of_trades: d.number_of_trades,
          }))
        )
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully stored ${mockBinanceApiOutput.length} records`));
    });

    test('API Error & Fallback: should use fallback if API fails and fallback exists (with new fields)', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockBinanceCandles.mockRejectedValue(new Error('Binance API Error'));
      (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData); // Fallback has new fields
      
      const result = await fetchBinanceData(symbol, interval as any);
      expect(mockGetFallbackData).toHaveBeenCalledWith(symbol, source_api_binance, interval);
      expect(result).toEqual(expectedTransformedBinanceOutput); // Transformed from FinancialData
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Binance API call failed for ${symbol}`));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using ${correspondingFinancialData.length} fallback data records for ${symbol}`));
    });
    
    test('API Error & Fallback: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockBinanceCandles.mockRejectedValue(new Error('Binance API Error'));
      (mockGetFallbackData as jest.Mock).mockReturnValue([]); // No fallback
      
      await expect(fetchBinanceData(symbol, interval as any)).rejects.toThrow(`Binance API fetch failed for ${symbol} (API Error: Binance API Error) and no fallback data available.`);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Binance API fetch failed for ${symbol} (API Error: Binance API Error) and no fallback data available.`));
    });

    test('Data Transformation: API to TransformedBinanceData (numeric, timestamp s)', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockBinanceCandles.mockResolvedValue(mockBinanceApiOutput);
      const result = await fetchBinanceData(symbol, interval as any);
      
      expect(result[0].timestamp).toBe(nowEpoch - 120); // ms to s
      expect(typeof result[0].open).toBe('number');
      expect(typeof result[0].high).toBe('number');
      expect(typeof result[0].low).toBe('number');
      expect(typeof result[0].close).toBe('number');
      expect(typeof result[0].volume).toBe('number');
    });

    test('Data Transformation: FinancialData (cache/fallback with new fields) to TransformedBinanceData', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue(correspondingFinancialData); // Includes new fields
      const result = await fetchBinanceData(symbol, interval as any);
      
      // TransformedBinanceData should NOT have the new fields
      expect(result[0]).not.toHaveProperty('quote_asset_volume');
      expect(result[0]).not.toHaveProperty('number_of_trades');
      expect(result[0].timestamp).toBe(correspondingFinancialData.sort((a,b) => b.timestamp - a.timestamp)[0].timestamp);
    });
  });

  // --- fetchHistoricalDataFromDB Tests (Updated for Binance data) ---
  describe('fetchHistoricalDataFromDB', () => {
    const symbol = 'ETHUSDT';
    const startDate = new Date('2023-02-01T00:00:00.000Z');
    const endDate = new Date('2023-02-03T00:00:00.000Z');
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const mockDbBinanceData: FinancialData[] = [
      { id: 1, symbol: symbol, timestamp: startTimestamp + 86400, open: 1500, high: 1520, low: 1480, close: 1510, volume: 1000, source_api: 'Binance', fetched_at: startTimestamp, interval: '1d', quote_asset_volume: 1510000, number_of_trades: 5000 },
      { id: 2, symbol: symbol, timestamp: startTimestamp + (2*86400), open: 1510, high: 1530, low: 1500, close: 1520, volume: 1100, source_api: 'Binance', fetched_at: startTimestamp, interval: '1d', quote_asset_volume: 1672000, number_of_trades: 5500 },
    ];
    const expectedHistoricalBinanceOutput: HistoricalDataPoint[] = mockDbBinanceData.map(dbRow => ({
      ...dbRow, // Includes all fields from FinancialData
      date: new Date(dbRow.timestamp * 1000),
    }));

    test('should retrieve and map Binance data with new fields correctly', async () => {
      (mockQueryHistoricalData as jest.Mock).mockReturnValue(mockDbBinanceData);
      const result = await fetchHistoricalDataFromDB(symbol, startDate, endDate, 'Binance', '1d');
      
      expect(mockQueryHistoricalData).toHaveBeenCalledWith(symbol, startTimestamp, endTimestamp, 'Binance', '1d');
      expect(result).toEqual(expectedHistoricalBinanceOutput);
      expect(result[0].quote_asset_volume).toBe(1510000);
      expect(result[0].number_of_trades).toBe(5000);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully fetched ${expectedHistoricalBinanceOutput.length} historical data points`));
    });
  });
});
