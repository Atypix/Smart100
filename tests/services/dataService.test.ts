import { fetchAlphaVantageData, fetchYahooFinanceData, YahooFinanceData, fetchBinanceData } from '../../src/services/dataService';
import axios from 'axios';
import { logger } from '../../src/utils/logger';
import yahooFinance from 'yahoo-finance2';
import Binance, { CandleChartResult } from 'binance-api-node';

// Mock axios, logger, yahoo-finance2, and binance-api-node
jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('yahoo-finance2');
jest.mock('binance-api-node');

const mockedAxios = axios as jest.Mocked<typeof axios>;


describe('fetchAlphaVantageData', () => {
  const testSymbol = 'IBM';
  const testApiKey = 'testapikey';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and return time series data successfully', async () => {
    const mockData = {
      'Meta Data': { '2. Symbol': testSymbol },
      'Time Series (5min)': { '2023-10-27 16:00:00': { '1. open': '150.00' } },
    };
    mockedAxios.get.mockResolvedValueOnce({ data: mockData });
    const result = await fetchAlphaVantageData(testSymbol, testApiKey);
    expect(result).toEqual(mockData['Time Series (5min)']);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(`Fetching Alpha Vantage data for symbol: ${testSymbol}`);
  });

  it('should throw an error if Alpha Vantage API returns an error message', async () => {
    const mockErrorResponse = { 'Error Message': 'Invalid API call.' };
    mockedAxios.get.mockResolvedValueOnce({ data: mockErrorResponse });
    await expect(fetchAlphaVantageData(testSymbol, testApiKey)).rejects.toThrow('Alpha Vantage API Error: Invalid API call.');
    expect(logger.error).toHaveBeenCalledWith('Alpha Vantage API Error: Invalid API call.');
  });

  it('should throw an error for network or other axios issues', async () => {
    const networkErrorMessage = 'Network Error';
    mockedAxios.get.mockRejectedValueOnce(new Error(networkErrorMessage));
    await expect(fetchAlphaVantageData(testSymbol, testApiKey)).rejects.toThrow(`Failed to fetch data from Alpha Vantage: ${networkErrorMessage}`);
  });

  it('should throw an error if time series data is not found in the response', async () => {
    const mockDataNoTimeSeries = { 'Meta Data': { '2. Symbol': testSymbol } };
    mockedAxios.get.mockResolvedValueOnce({ data: mockDataNoTimeSeries });
    await expect(fetchAlphaVantageData(testSymbol, testApiKey)).rejects.toThrow('Time series data not found in Alpha Vantage response.');
  });
});

describe('fetchYahooFinanceData', () => {
  const mockYahooFinance = yahooFinance as jest.Mocked<typeof yahooFinance>;

  beforeEach(() => {
    mockYahooFinance.historical.mockClear();
    if (typeof logger !== 'undefined' && (logger.info as jest.Mock).mockClear) {
        (logger.info as jest.Mock).mockClear();
        (logger.error as jest.Mock).mockClear();
        (logger.warn as jest.Mock).mockClear();
    }
  });

  it('should fetch and return data for a valid symbol', async () => {
    const mockData = [{ date: new Date('2023-01-01'), open: 100, high: 105, low: 99, close: 102, volume: 10000 }];
    mockYahooFinance.historical.mockResolvedValue(mockData as any);
    const data = await fetchYahooFinanceData('AAPL');
    expect(data).toEqual(mockData);
    expect(mockYahooFinance.historical).toHaveBeenCalledWith('AAPL', expect.any(Object));
    expect(logger.info).toHaveBeenCalledWith('Fetching Yahoo Finance historical data for symbol: AAPL');
  });

  it('should return an empty array if no data is returned for a symbol', async () => {
    mockYahooFinance.historical.mockResolvedValue([]);
    const data = await fetchYahooFinanceData('NODATA');
    expect(data).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('No data returned from Yahoo Finance for symbol: NODATA');
  });

  it('should throw an error if the API call fails', async () => {
    const apiError = new Error('Yahoo API Error');
    mockYahooFinance.historical.mockRejectedValue(apiError);
    await expect(fetchYahooFinanceData('ERROR')).rejects.toThrow('Error fetching data for symbol ERROR from Yahoo Finance. Details: Yahoo API Error');
  });

  it('should handle errors when symbol is not found (simulated by API error)', async () => {
    const notFoundError = new Error('Symbol not found');
    mockYahooFinance.historical.mockRejectedValue(notFoundError);
    await expect(fetchYahooFinanceData('INVALID')).rejects.toThrow('Error fetching data for symbol INVALID from Yahoo Finance. Details: Symbol not found');
  });
});

describe('fetchBinanceData', () => {
  const mockBinanceClient = {
    candles: jest.fn(),
  };
  // @ts-ignore
  const MockedBinance = Binance as jest.MockedFunction<typeof Binance>;

  beforeEach(() => {
    MockedBinance.mockImplementation(() => mockBinanceClient as any);
    mockBinanceClient.candles.mockClear();
    if (typeof logger !== 'undefined' && (logger.info as jest.Mock).mockClear) {
        (logger.info as jest.Mock).mockClear();
        (logger.error as jest.Mock).mockClear();
        (logger.warn as jest.Mock).mockClear();
    }
  });

  it('should fetch and return K-line data for a valid symbol and interval', async () => {
    const mockKlineData: CandleChartResult[] = [
      { openTime: 1672531200000, open: '100', high: '105', low: '99', close: '102', volume: '1000', closeTime: 1672534799999, quoteAssetVolume: '102000', numberOfTrades: 100, takerBuyBaseAssetVolume: '500', takerBuyQuoteAssetVolume: '51000', ignore: '0' },
      { openTime: 1672534800000, open: '102', high: '106', low: '101', close: '105', volume: '1200', closeTime: 1672538399999, quoteAssetVolume: '126000', numberOfTrades: 120, takerBuyBaseAssetVolume: '600', takerBuyQuoteAssetVolume: '63000', ignore: '0' },
    ];
    mockBinanceClient.candles.mockResolvedValue(mockKlineData);

    const data = await fetchBinanceData('BTCUSDT', '1h');
    expect(data).toEqual(mockKlineData);
    expect(mockBinanceClient.candles).toHaveBeenCalledWith({ symbol: 'BTCUSDT', interval: '1h' });
    expect(logger.info).toHaveBeenCalledWith('Fetching Binance K-line data for symbol: BTCUSDT, interval: 1h');
    expect(logger.info).toHaveBeenCalledWith(`Successfully fetched ${mockKlineData.length} K-line entries for symbol: BTCUSDT, interval: 1h from Binance.`);
  });

  it('should return an empty array if no K-line data is returned', async () => {
    mockBinanceClient.candles.mockResolvedValue([]);

    const data = await fetchBinanceData('ETHUSDT', '1d');
    expect(data).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('No K-line data returned from Binance for symbol: ETHUSDT, interval: 1d');
  });

  it('should throw an error if the API call fails (e.g., network issue)', async () => {
    const apiError = new Error('Binance API Error');
    mockBinanceClient.candles.mockRejectedValue(apiError);

    await expect(fetchBinanceData('ADAUSDT', '5m')).rejects.toThrow('Error fetching K-line data for symbol ADAUSDT, interval 5m from Binance. Details: Binance API Error');
    expect(logger.error).toHaveBeenCalledWith(
      'Error fetching K-line data for symbol ADAUSDT, interval 5m from Binance. Details: Binance API Error',
      { symbol: 'ADAUSDT', interval: '5m', error: apiError }
    );
  });

  it('should handle API errors with error codes from Binance', async () => {
    const binanceSpecificError = new Error('Invalid symbol.') as any;
    binanceSpecificError.code = -1121;
    mockBinanceClient.candles.mockRejectedValue(binanceSpecificError);

    await expect(fetchBinanceData('INVALID', '1h')).rejects.toThrow('Error fetching K-line data for symbol INVALID, interval 1h from Binance. Binance Error Code: -1121. Details: Invalid symbol.');
    expect(logger.error).toHaveBeenCalledWith(
      'Error fetching K-line data for symbol INVALID, interval 1h from Binance. Binance Error Code: -1121. Details: Invalid symbol.',
      { symbol: 'INVALID', interval: '1h', error: binanceSpecificError }
    );
  });
});
