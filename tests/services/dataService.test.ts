// Mock dependencies
jest.mock('axios');
jest.mock('../../src/database', () => ({
  insertData: jest.fn(),
  getRecentData: jest.fn(() => []), 
  getFallbackData: jest.fn(() => []), 
  queryHistoricalData: jest.fn(() => []), 
}));
const mockYahooHistorical = jest.fn();
jest.mock('yahoo-finance2', () => ({
  __esModule: true, 
  default: { 
    historical: mockYahooHistorical,
  },
}));

jest.mock('../../src/utils/logger', () => ({ 
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

import axios from 'axios';
// import yahooFinance from 'yahoo-finance2'; // This will be the mocked version
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
  insertData as mockInsertData,
  getRecentData as mockGetRecentData,
  getFallbackData as mockGetFallbackData,
  queryHistoricalData as mockQueryHistoricalDataFromDB, 
} from '../../src/database'; 
import type { FinancialData } from '../../src/database'; 
import logger from '../../src/utils/logger'; 

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Data Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAlphaVantageData', () => {
    const symbol = 'IBM';
    const apiKey = 'TEST_API_KEY';
    const interval = '5min';
    const source_api = 'AlphaVantage';
    
    const mockApiTimeSeries = {
      "2023-10-27 16:00:00": { "1. open": "150.00", "2. high": "152.00", "3. low": "149.00", "4. close": "151.00", "5. volume": "10000" },
      "2023-10-27 15:55:00": { "1. open": "149.50", "2. high": "150.50", "3. low": "149.00", "4. close": "150.00", "5. volume": "8000" },
    };
    const expectedTransformedOutput: TimeSeriesData = {
      symbol: symbol,
      interval: interval,
      timeSeries: [ 
        { timestamp: "2023-10-27 16:00:00", open: 150, high: 152, low: 149, close: 151, volume: 10000 },
        { timestamp: "2023-10-27 15:55:00", open: 149.50, high: 150.50, low: 149, close: 150, volume: 8000 },
      ],
    };
    const correspondingFinancialData: FinancialData[] = [
        { symbol: symbol, timestamp: Math.floor(new Date("2023-10-27 16:00:00").getTime()/1000), open: 150, high: 152, low: 149, close: 151, volume: 10000, source_api: source_api, fetched_at: expect.any(Number), interval: interval, id: 1 },
        { symbol: symbol, timestamp: Math.floor(new Date("2023-10-27 15:55:00").getTime()/1000), open: 149.50, high: 150.50, low: 149, close: 150, volume: 8000, source_api: source_api, fetched_at: expect.any(Number), interval: interval, id: 2 },
    ];

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
      
      const expectedDbInsertData = correspondingFinancialData.map(d => {
        const { id, fetched_at, ...rest } = d; 
        return expect.objectContaining({...rest, fetched_at: expect.any(Number)});
      });
      expect(mockInsertData).toHaveBeenCalledWith(expect.arrayContaining(expectedDbInsertData));
    });

    test('API Error & Fallback: should use fallback if API fails and fallback exists', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Network Error'); 
      mockedAxios.get.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue(correspondingFinancialData); 
      const result = await fetchAlphaVantageData(symbol, apiKey);
      expect(mockGetFallbackData).toHaveBeenCalledWith(symbol, source_api, interval);
      expect(result).toEqual(expectedTransformedOutput); 
    });
    
    test('API Error & Fallback Miss: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Network Error'); 
      mockedAxios.get.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue([]); 
      const expectedApiErrorMsg = `Generic error processing Alpha Vantage data for ${symbol}: ${mockError.message}`;
      const expectedErrorMessage = `API fetch failed for ${symbol} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchAlphaVantageData(symbol, apiKey)).rejects.toThrow(expectedErrorMessage);
    });
    
    test('API Error & Fallback Failure: should throw if API fails and fallback query also fails', async () => {
        (mockGetRecentData as jest.Mock).mockReturnValue([]);
        const mockApiError = new Error('Simulated API Network Error');
        mockedAxios.get.mockRejectedValue(mockApiError);
        const dbFallbackError = new Error("Simulated DB error during fallback query");
        (mockGetFallbackData as jest.Mock).mockImplementation(() => {
          throw dbFallbackError;
        });
        const expectedApiErrorMsg = `Generic error processing Alpha Vantage data for ${symbol}: ${mockApiError.message}`;
        // This is the message an end-user would see if fallback also fails
        const expectedThrownErrorMessage = `API fetch failed for ${symbol} (${expectedApiErrorMsg}), and an error occurred while querying fallback data.`;
        await expect(fetchAlphaVantageData(symbol, apiKey)).rejects.toThrow(expectedThrownErrorMessage);
    });
  });

  describe('fetchYahooFinanceData', () => {
    const symbol = 'AAPL';
    const source_api_yahoo = 'YahooFinance';
    const interval_yahoo = '1d';

    const mockApiOutput: YahooFinanceData[] = [ 
      { date: new Date('2023-10-26T00:00:00.000Z'), open: 170, high: 172, low: 169, close: 171, volume: 50000 },
      { date: new Date('2023-10-25T00:00:00.000Z'), open: 172, high: 173, low: 171, close: 172, volume: 60000 },
    ];
    const correspondingFinancialData: FinancialData[] = mockApiOutput.map(item => ({
      id: expect.any(Number) as unknown as number, 
      symbol: symbol,
      timestamp: Math.floor(item.date.getTime() / 1000),
      open: item.open, high: item.high, low: item.low, close: item.close, volume: item.volume,
      source_api: source_api_yahoo, fetched_at: expect.any(Number), interval: interval_yahoo,
    }));
    const expectedTransformedOutput: YahooFinanceData[] = [...mockApiOutput].sort((a,b) => b.date.getTime() - a.date.getTime());

    test('API Success & Storage: should fetch, transform, store, and return data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      mockYahooHistorical.mockResolvedValue(mockApiOutput);
      const result = await fetchYahooFinanceData(symbol);
      expect(result).toEqual(expectedTransformedOutput);
      
      const expectedDbInsertData = correspondingFinancialData.map(d => {
        const { id, fetched_at, ...rest } = d; 
        return expect.objectContaining({...rest, fetched_at: expect.any(Number)});
      });
      expect(mockInsertData).toHaveBeenCalledWith(expect.arrayContaining(expectedDbInsertData));
    });

    test('API Error & Fallback Miss: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Yahoo Network Error'); 
      mockYahooHistorical.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue([]);
      const expectedApiErrorMsg = `Error fetching data for symbol ${symbol} from Yahoo Finance API. Details: ${mockError.message}`;
      const expectedErrorMessage = `Yahoo API fetch failed for ${symbol} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchYahooFinanceData(symbol)).rejects.toThrow(expectedErrorMessage);
    });
    
    test('API Error & Fallback Failure (Yahoo): should throw if API and fallback query fail', async () => {
        (mockGetRecentData as jest.Mock).mockReturnValue([]);
        const mockApiError = new Error('Simulated Yahoo Network Error');
        mockYahooHistorical.mockRejectedValue(mockApiError);
        const dbFallbackError = new Error("Simulated DB error during Yahoo fallback");
        (mockGetFallbackData as jest.Mock).mockImplementation(() => {
          throw dbFallbackError;
        });
        const expectedApiErrorMsg = `Error fetching data for symbol ${symbol} from Yahoo Finance API. Details: ${mockApiError.message}`;
        const expectedThrownErrorMessage = `Yahoo API fetch failed for ${symbol} (${expectedApiErrorMsg}), and an error occurred while querying fallback data.`;
        await expect(fetchYahooFinanceData(symbol)).rejects.toThrow(expectedThrownErrorMessage);
    });
  });

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
      (mockQueryHistoricalDataFromDB as jest.Mock).mockReturnValue(mockDbResponse);
      const result = await fetchHistoricalDataFromDB(symbol, startDate, endDate, 'DB_Source', '1d_interval');
      expect(mockQueryHistoricalDataFromDB).toHaveBeenCalledWith(symbol, startTimestamp, endTimestamp, 'DB_Source', '1d_interval');
      expect(result).toEqual(expectedTransformedResult);
    });
  });

  describe('fetchBinanceData', () => {
    const symbol = 'BTCUSDT';
    const interval = '1h';
    const source_api_binance = 'Binance';
    const nowMilliseconds = Date.now();

    const mockApiKlines: any[][] = [
      [nowMilliseconds - 3600000, "60000.0", "60500.0", "59800.0", "60200.0", "1000"], 
      [nowMilliseconds - 7200000, "59500.0", "60000.0", "59300.0", "59800.0", "1200"], 
    ];

    const expectedKlineDataOutput: KlineData[] = mockApiKlines.map(k => ({
      timestamp: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })).sort((a,b) => a.timestamp - b.timestamp); 

    const correspondingFinancialData: FinancialData[] = expectedKlineDataOutput.map(kline => ({
      id: expect.any(Number) as unknown as number, 
      symbol: symbol.toUpperCase(),
      timestamp: Math.floor(kline.timestamp / 1000), 
      open: kline.open, high: kline.high, low: kline.low, close: kline.close, volume: kline.volume,
      source_api: source_api_binance, fetched_at: expect.any(Number), interval: interval,
    }));
    
    test('Caching Miss & Archive: should call API if no recent cache, then archive data', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]); 
      mockedAxios.get.mockResolvedValue({ data: mockApiKlines });

      await fetchBinanceData(symbol, interval);
      
      const expectedDataForDbInsert = expectedKlineDataOutput.map(kline => {
        return expect.objectContaining({
            symbol: symbol.toUpperCase(),
            timestamp: Math.floor(kline.timestamp / 1000),
            open: kline.open,
            high: kline.high,
            low: kline.low,
            close: kline.close,
            volume: kline.volume,
            source_api: source_api_binance,
            interval: interval,
            fetched_at: expect.any(Number), // Important: use expect.any(Number) here
        });
      });
      expect(mockInsertData).toHaveBeenCalledWith(expect.arrayContaining(expectedDataForDbInsert));
    });

    test('API Error & Fallback Miss: should throw if API fails and no fallback', async () => {
      (mockGetRecentData as jest.Mock).mockReturnValue([]);
      const mockError = new Error('Simulated Binance API Network Error'); 
      mockedAxios.get.mockRejectedValue(mockError);
      (mockGetFallbackData as jest.Mock).mockReturnValue([]); 
      
      const expectedApiErrorMsg = `Generic error processing Binance data for ${symbol.toUpperCase()}: ${mockError.message}`;
      const expectedErrorMessage = `Binance API fetch failed for ${symbol.toUpperCase()} (${expectedApiErrorMsg}) and no fallback data available.`;
      await expect(fetchBinanceData(symbol, interval)).rejects.toThrow(expectedErrorMessage);
    });

    test('API Error & Fallback Failure (Binance): should throw if API fails and fallback query also fails', async () => {
        (mockGetRecentData as jest.Mock).mockReturnValue([]);
        const mockApiError = new Error('Simulated Binance API Network Error');
        mockedAxios.get.mockRejectedValue(mockApiError);
        const dbFallbackError = new Error("Simulated DB error during Binance fallback");
        (mockGetFallbackData as jest.Mock).mockImplementation(() => {
          throw dbFallbackError;
        });
        const expectedApiErrorMsg = `Generic error processing Binance data for ${symbol.toUpperCase()}: ${mockApiError.message}`;
        const expectedThrownErrorMessage = `Binance API fetch failed for ${symbol.toUpperCase()} (${expectedApiErrorMsg}), and an error occurred while querying fallback data.`;
        await expect(fetchBinanceData(symbol, interval)).rejects.toThrow(expectedThrownErrorMessage);
    });
  });
});
