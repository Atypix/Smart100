import axios from 'axios';
import { logger } from '../../utils/logger';

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
    const response = await axios.get(url);
    const data = response.data;

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
