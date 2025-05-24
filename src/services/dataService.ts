import axios from 'axios';
import { logger } from '../../utils/logger';
import yahooFinance from 'yahoo-finance2';
import Binance, { CandleChartResult } from 'binance-api-node';

interface TimeSeriesData {
  [timestamp: string]: {
    '1. open': string;
    '2. high': string;
    '3. low': string;
    '4. close': string;
    '5. volume': string;
  };
}

interface AlphaVantageError {
  'Error Message': string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAlphaVantageError(data: any): data is AlphaVantageError {
  return data && typeof data['Error Message'] === 'string';
}


export async function fetchAlphaVantageData(symbol: string, apiKey: string): Promise<TimeSeriesData> {
  const functionName = 'TIME_SERIES_INTRADAY';
  const interval = '5min';
  const outputsize = 'compact';
  // It's good practice to use HTTPS for API requests.
  const baseUrl = 'https://www.alphavantage.co/query';

  const url = `${baseUrl}?function=${functionName}&symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;

  try {
    logger.info(`Fetching Alpha Vantage data for symbol: ${symbol}`);
    const response = await axios.get(url);
    const data = response.data;

    if (isAlphaVantageError(data)) {
      const errorMessage = `Alpha Vantage API Error: ${data['Error Message']}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    // The key for time series data can vary based on the interval.
    // For "5min" interval, it's "Time Series (5min)".
    const timeSeriesKey = `Time Series (${interval})`;
    const timeSeries = data[timeSeriesKey];

    if (!timeSeries) {
      const errorMessage = 'Time series data not found in Alpha Vantage response.';
      logger.error(errorMessage, { responseData: data });
      // This could happen if the API response structure is unexpected
      // or if the symbol is valid but there's no intraday data for it (less likely for major symbols).
      // console.error('API Response Data:', data); // Replaced by logger
      throw new Error(errorMessage);
    }

    const numEntries = Object.keys(timeSeries).length;
    logger.info(`Successfully fetched ${numEntries} time series entries for symbol: ${symbol}`);
    return timeSeries as TimeSeriesData;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Handle network errors or errors from axios itself
      const errorMessage = `Axios error fetching Alpha Vantage data: ${error.message}`;
      logger.error(errorMessage, {
        url,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        responseData: error.response?.data,
        responseStatus: error.response?.status,
      });
      // console.error('Axios error fetching Alpha Vantage data:', error.message); // Replaced by logger
      // if (error.response) { // Replaced by logger
      //   console.error('Error response data:', error.response.data);
      //   console.error('Error response status:', error.response.status);
      // }
      throw new Error(`Failed to fetch data from Alpha Vantage: ${error.message}`);
    } else if (error instanceof Error) {
      // Handles errors thrown from within the try block (e.g., API error or missing time series data)
      logger.error(`Error processing Alpha Vantage data: ${error.message}`, { error });
      throw error;
    }
    // Fallback for unknown errors
    logger.error('Unknown error fetching Alpha Vantage data:', { error });
    // console.error('Unknown error fetching Alpha Vantage data:', error); // Replaced by logger
    throw new Error('An unknown error occurred while fetching Alpha Vantage data.');
  }
}

// New Interface for Yahoo Finance Data
interface YahooFinanceData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number; // adjClose is often available and useful
}

export async function fetchYahooFinanceData(symbol: string): Promise<YahooFinanceData[]> {
  logger.info(`Fetching Yahoo Finance historical data for symbol: ${symbol}`);
  try {
    // Basic query options: last 7 days of data. This can be parameterized later.
    const queryOptions = {
      period1: new Date(new Date().setDate(new Date().getDate() - 7)), // 7 days ago
      period2: new Date(), // today
      interval: '1d', // daily
    };
    const results = await yahooFinance.historical(symbol, queryOptions);

    if (!results || results.length === 0) {
      const errorMessage = `No data returned from Yahoo Finance for symbol: ${symbol}`;
      logger.warn(errorMessage);
      return []; // Return empty array if no data
    }

    // Assuming the library returns data in a compatible format or requires minimal mapping.
    // If the library's return type is already suitable and matches YahooFinanceData, direct assertion can be used.
    // Otherwise, a mapping step would be needed here.
    // For now, let's assume the structure is close enough.
    logger.info(`Successfully fetched ${results.length} historical data points for symbol: ${symbol} from Yahoo Finance.`);
    return results as YahooFinanceData[];
  } catch (error) {
    let errorMessage = `Error fetching data for symbol ${symbol} from Yahoo Finance.`;
    if (error instanceof Error) {
      errorMessage += ` Details: ${error.message}`;
    }
    // Check if it's a specific error type from yahoo-finance2, if available, for more detailed logging
    // e.g., if (error.name === 'FailedYahooValidationError') logger.warn(...)
    logger.error(errorMessage, { symbol, error });
    throw new Error(errorMessage);
  }
}

export async function fetchBinanceData(symbol: string, interval: string): Promise<CandleChartResult[]> {
  // Initialize Binance client. No API key/secret needed for public data like klines.
  const client = Binance();
  logger.info(`Fetching Binance K-line data for symbol: ${symbol}, interval: ${interval}`);

  try {
    const klines = await client.candles({ symbol, interval });

    if (!klines || klines.length === 0) {
      const errorMessage = `No K-line data returned from Binance for symbol: ${symbol}, interval: ${interval}`;
      logger.warn(errorMessage);
      return []; // Return empty array if no data
    }

    logger.info(`Successfully fetched ${klines.length} K-line entries for symbol: ${symbol}, interval: ${interval} from Binance.`);
    // The 'binance-api-node' library's `candles` method already returns typed results (CandleChartResult[]).
    // So, we can use that type directly if it matches our needs or adapt it.
    // For now, we'll use CandleChartResult directly as the return type.
    return klines;
  } catch (error) {
    let errorMessage = `Error fetching K-line data for symbol ${symbol}, interval ${interval} from Binance.`;
    if (error instanceof Error) {
      // binance-api-node might throw specific error types or include error codes
      if ('code' in error) {
        errorMessage += ` Binance Error Code: ${(error as any).code}.`; // Added type assertion for error.code
      }
      errorMessage += ` Details: ${error.message}`;
    }
    logger.error(errorMessage, { symbol, interval, error });
    throw new Error(errorMessage);
  }
}
