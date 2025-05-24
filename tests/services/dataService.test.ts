import { fetchAlphaVantageData, fetchYahooFinanceData, YahooFinanceData } from '../../src/services/dataService';
import axios from 'axios';
import { logger } from '../../src/utils/logger';
import yahooFinance from 'yahoo-finance2';

// Mock axios, logger, and yahoo-finance2
jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(), // Add warn if it's used, or any other level
    debug: jest.fn(), // Add debug if it's used
  },
}));
jest.mock('yahoo-finance2');

const mockedAxios = axios as jest.Mocked<typeof axios>;
// If you need to access the mocked logger, you can cast it similarly, though often direct mocking of its methods as above is sufficient.
// const mockedLogger = logger as jest.Mocked<typeof logger>;


describe('fetchAlphaVantageData', () => {
  const testSymbol = 'IBM';
  const testApiKey = 'testapikey';

  beforeEach(() => {
    // Clears the history of all mocks before each test
    jest.clearAllMocks();
  });

  it('should fetch and return time series data successfully', async () => {
    const mockData = {
      'Meta Data': {
        '1. Information': 'Intraday (5min) open, high, low, close prices and volume',
        '2. Symbol': testSymbol,
        '3. Last Refreshed': '2023-10-27 16:00:00',
        '4. Interval': '5min',
        '5. Output Size': 'Compact',
        '6. Time Zone': 'US/Eastern',
      },
      'Time Series (5min)': {
        '2023-10-27 16:00:00': {
          '1. open': '150.00',
          '2. high': '150.50',
          '3. low': '149.50',
          '4. close': '150.25',
          '5. volume': '10000',
        },
        '2023-10-27 15:55:00': {
          '1. open': '149.80',
          '2. high': '150.10',
          '3. low': '149.70',
          '4. close': '150.00',
          '5. volume': '8000',
        },
      },
    };

    mockedAxios.get.mockResolvedValueOnce({ data: mockData });

    const result = await fetchAlphaVantageData(testSymbol, testApiKey);

    expect(result).toEqual(mockData['Time Series (5min)']);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${testSymbol}&interval=5min&outputsize=compact&apikey=${testApiKey}`
    );
    expect(logger.info).toHaveBeenCalledWith(`Fetching Alpha Vantage data for symbol: ${testSymbol}`);
    expect(logger.info).toHaveBeenCalledWith(`Successfully fetched 2 time series entries for symbol: ${testSymbol}`);
  });

  it('should throw an error if Alpha Vantage API returns an error message', async () => {
    const mockErrorResponse = {
      'Error Message': 'Invalid API call. Please check your API key and parameters.',
    };

    mockedAxios.get.mockResolvedValueOnce({ data: mockErrorResponse });

    await expect(fetchAlphaVantageData(testSymbol, testApiKey)).rejects.toThrow(
      `Alpha Vantage API Error: ${mockErrorResponse['Error Message']}`
    );
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(`Alpha Vantage API Error: ${mockErrorResponse['Error Message']}`);
  });

  it('should throw an error for network or other axios issues', async () => {
    const networkErrorMessage = 'Network Error';
    mockedAxios.get.mockRejectedValueOnce(new Error(networkErrorMessage));

    await expect(fetchAlphaVantageData(testSymbol, testApiKey)).rejects.toThrow(
      `Failed to fetch data from Alpha Vantage: ${networkErrorMessage}`
    );
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      `Axios error fetching Alpha Vantage data: ${networkErrorMessage}`,
      expect.anything() // The second argument to logger.error can be an object with more details
    );
  });

  it('should throw an error if time series data is not found in the response', async () => {
    const mockDataNoTimeSeries = {
      'Meta Data': {
        '1. Information': 'Intraday (5min) open, high, low, close prices and volume',
        '2. Symbol': testSymbol,
      },
      // Missing 'Time Series (5min)'
    };

    mockedAxios.get.mockResolvedValueOnce({ data: mockDataNoTimeSeries });

    await expect(fetchAlphaVantageData(testSymbol, testApiKey)).rejects.toThrow(
      'Time series data not found in Alpha Vantage response.'
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Time series data not found in Alpha Vantage response.',
      { responseData: mockDataNoTimeSeries }
    );
  });
});

describe('fetchYahooFinanceData', () => {
  const mockYahooFinance = yahooFinance as jest.Mocked<typeof yahooFinance>;
  // Assuming 'logger' is imported from '../../src/utils/logger' and mocked globally for the test file.
  // If not, the logger mock clearing in beforeEach needs to be adjusted or logger needs to be imported.

  beforeEach(() => {
    mockYahooFinance.historical.mockClear();
    // Clear logger mocks. This assumes 'logger' is imported and its methods are jest.fn().
    // If logger is mocked like: jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), ... } }));
    // then you might need to import logger and then clear its methods.
    // For example, after importing: import { logger } from '../../src/utils/logger';
    if (typeof logger !== 'undefined' && (logger.info as jest.Mock).mockClear) {
        (logger.info as jest.Mock).mockClear();
        (logger.error as jest.Mock).mockClear();
        (logger.warn as jest.Mock).mockClear();
    }
  });

  it('should fetch and return data for a valid symbol', async () => {
    const mockData = [
      { date: new Date('2023-01-01'), open: 100, high: 105, low: 99, close: 102, volume: 10000 },
      { date: new Date('2023-01-02'), open: 102, high: 106, low: 101, close: 105, volume: 12000 },
    ];
    mockYahooFinance.historical.mockResolvedValue(mockData as any); // 'as any' for mock convenience

    const data = await fetchYahooFinanceData('AAPL');
    expect(data).toEqual(mockData);
    expect(mockYahooFinance.historical).toHaveBeenCalledWith('AAPL', expect.any(Object));
    expect(logger.info).toHaveBeenCalledWith('Fetching Yahoo Finance historical data for symbol: AAPL');
    expect(logger.info).toHaveBeenCalledWith(`Successfully fetched ${mockData.length} historical data points for symbol: AAPL from Yahoo Finance.`);
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
    expect(logger.error).toHaveBeenCalledWith(
      'Error fetching data for symbol ERROR from Yahoo Finance. Details: Yahoo API Error',
      { symbol: 'ERROR', error: apiError }
    );
  });

  it('should handle errors when symbol is not found (simulated by API error)', async () => {
    const notFoundError = new Error('Symbol not found');
    mockYahooFinance.historical.mockRejectedValue(notFoundError);

    await expect(fetchYahooFinanceData('INVALID')).rejects.toThrow('Error fetching data for symbol INVALID from Yahoo Finance. Details: Symbol not found');
    expect(logger.error).toHaveBeenCalledWith(
      'Error fetching data for symbol INVALID from Yahoo Finance. Details: Symbol not found',
      { symbol: 'INVALID', error: notFoundError }
    );
  });
});
