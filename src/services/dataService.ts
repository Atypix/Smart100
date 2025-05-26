import axios from 'axios';
import logger from '../utils/logger'; // Corrected import path and type
import yahooFinance from 'yahoo-finance2';
import { insertData, getRecentData, getFallbackData, FinancialData, queryHistoricalData as queryHistoricalDataFromDB } from '../database'; // Import database functions

// Define the structure for Alpha Vantage Time Series Data
interface AlphaVantageTimeSeriesData {
  [timestamp: string]: {
    '1. open': string;
    '2. high': string;
    '3. low': string;
    '4. close': string;
    '5. volume': string;
  };
}

// Define the structure for the data returned by the function (can be different from API response)
export interface TimeSeriesData {
  symbol: string;
  interval: string;
  timeSeries: CandlestickData[];
}

export interface CandlestickData {
  timestamp: string; // ISO format string e.g., "2023-10-07 16:00:00"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}


interface AlphaVantageError {
  'Error Message'?: string;
  'Information'?: string; // For rate limit messages
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAlphaVantageError(data: any): data is AlphaVantageError {
  return data && (typeof data['Error Message'] === 'string' || typeof data['Information'] === 'string');
}

const CACHE_RECENCY_THRESHOLD_SECONDS = 15 * 60; // 15 minutes

export async function fetchAlphaVantageData(symbol: string, apiKey: string): Promise<TimeSeriesData | null> {
  const functionName = 'TIME_SERIES_INTRADAY';
  const interval = '5min';
  const outputsize = 'compact'; // Or 'full'
  const source_api = 'AlphaVantage';
  const nowEpochSeconds = Math.floor(Date.now() / 1000);

  // 1. Caching Logic
  try {
    const thresholdTimestamp = nowEpochSeconds - CACHE_RECENCY_THRESHOLD_SECONDS;
    logger.info(`Checking cache for ${symbol} (${source_api}, ${interval}) data fetched after ${new Date(thresholdTimestamp * 1000).toISOString()}`);
    const cachedDataRecords = getRecentData(symbol, source_api, interval, thresholdTimestamp);

    if (cachedDataRecords.length > 0) {
      logger.info(`Using ${cachedDataRecords.length} cached data records for ${symbol} from ${source_api} for interval ${interval}.`);
      return {
        symbol: symbol,
        interval: interval,
        timeSeries: cachedDataRecords.map(record => ({
          timestamp: new Date(record.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19),
          open: record.open,
          high: record.high,
          low: record.low,
          close: record.close,
          volume: record.volume,
        })).sort((a: CandlestickData, b: CandlestickData) => b.timestamp.localeCompare(a.timestamp)), // Sort descending
      };
    }
    logger.info(`No recent cached data for ${symbol} (${source_api}, ${interval}). Fetching from API.`);
  } catch (dbError) {
    logger.error('Error querying cache:', { symbol, source_api, interval, error: dbError });
    // Proceed to API fetch if cache query fails
  }

  // 2. API Fetch
  const baseUrl = 'https://www.alphavantage.co/query';
  const url = `${baseUrl}?function=${functionName}&symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;

  try {
    logger.info(`Fetching Alpha Vantage data for symbol: ${symbol} from ${url}`);
    const response = await axios.get(url);
    const data = response.data;

    if (isAlphaVantageError(data)) {
      const errorMessage = data['Error Message'] || data['Information'] || 'Unknown API error';
      logger.error(`Alpha Vantage API Error for ${symbol}: ${errorMessage}`);
      return await handleApiErrorAndFetchFallback(symbol, source_api, interval, `API Error: ${errorMessage}`);
    }

    const timeSeriesKey = `Time Series (${interval})`;
    const timeSeriesApi = data[timeSeriesKey] as AlphaVantageTimeSeriesData | undefined;

    if (!timeSeriesApi) {
      const errorMessage = `Time series data key '${timeSeriesKey}' not found in Alpha Vantage response.`;
      logger.error(errorMessage, { responseData: data, symbol });
      return await handleApiErrorAndFetchFallback(symbol, source_api, interval, errorMessage);
    }

    const fetched_at = Math.floor(Date.now() / 1000);
    const recordsToStore: FinancialData[] = [];
    const timeSeriesOutput: CandlestickData[] = [];

    for (const [timestampStr, values] of Object.entries(timeSeriesApi)) {
      const recordTimestamp = Math.floor(new Date(timestampStr).getTime() / 1000);
      // Basic validation for timestamp to avoid NaN issues if date parsing fails
      if (isNaN(recordTimestamp)) {
        logger.warn(`Skipping record with invalid timestamp string: ${timestampStr} for symbol ${symbol}`);
        continue;
      }
      const record: FinancialData = {
        symbol: symbol,
        timestamp: recordTimestamp,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'], 10),
        source_api: source_api,
        fetched_at: fetched_at,
        interval: interval,
      };
      recordsToStore.push(record);
      timeSeriesOutput.push({
        timestamp: timestampStr, // Keep original string format for output
        open: record.open,
        high: record.high,
        low: record.low,
        close: record.close,
        volume: record.volume,
      });
    }
    
    const numEntries = Object.keys(timeSeriesApi).length;
    logger.info(`Successfully fetched ${numEntries} time series entries for symbol: ${symbol} from API.`);

    // 4. Store fetched data
    if (recordsToStore.length > 0) {
      try {
        logger.info(`Attempting to store ${recordsToStore.length} records for ${symbol} from ${source_api}.`);
        insertData(recordsToStore); // This function should be synchronous as per better-sqlite3
        logger.info(`Successfully stored ${recordsToStore.length} records for ${symbol} from ${source_api}.`);
      } catch (dbError) {
        logger.error('Error storing fetched data:', { symbol, source_api, error: dbError });
        // Continue to return data even if storage fails, as API call was successful
      }
    }
    
    timeSeriesOutput.sort((a: CandlestickData, b: CandlestickData) => b.timestamp.localeCompare(a.timestamp)); // Sort descending

    return {
      symbol: symbol,
      interval: interval,
      timeSeries: timeSeriesOutput,
    };

  } catch (error) {
    let errorMessage = `Error fetching data from Alpha Vantage for ${symbol}`;
    if (axios.isAxiosError(error)) {
      errorMessage = `Axios error fetching Alpha Vantage data for ${symbol}: ${error.message}`;
      logger.error(errorMessage, { url, responseData: error.response?.data, responseStatus: error.response?.status });
    } else if (error instanceof Error) {
      errorMessage = `Generic error processing Alpha Vantage data for ${symbol}: ${error.message}`;
      logger.error(errorMessage, { error });
    } else {
      logger.error('Unknown error fetching Alpha Vantage data:', { error, symbol });
    }
    return await handleApiErrorAndFetchFallback(symbol, source_api, interval, errorMessage);
  }
}

async function handleApiErrorAndFetchFallback(symbol: string, source_api: string, interval: string, apiErrorMsg: string): Promise<TimeSeriesData | null> {
  logger.warn(`API call failed for ${symbol} (${source_api}, ${interval}): ${apiErrorMsg}. Attempting to use fallback data.`);
  try {
    const fallbackRecords = getFallbackData(symbol, source_api, interval);
    if (fallbackRecords.length > 0) {
      logger.info(`Using ${fallbackRecords.length} fallback data records for ${symbol} from ${source_api} for interval ${interval}.`);
      return {
        symbol: symbol,
        interval: interval,
        timeSeries: fallbackRecords.map(record => ({
          timestamp: new Date(record.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19),
          open: record.open,
          high: record.high,
          low: record.low,
          close: record.close,
          volume: record.volume,
        })).sort((a: CandlestickData, b: CandlestickData) => b.timestamp.localeCompare(a.timestamp)), // Sort descending
      };
    }
    const finalErrorMessage = `API fetch failed for ${symbol} (${apiErrorMsg}) and no fallback data available.`;
    logger.error(finalErrorMessage);
    throw new Error(finalErrorMessage); // Re-throw critical error
  } catch (dbError) {
    const finalErrorMessage = `API fetch failed for ${symbol} (${apiErrorMsg}), and an error occurred while querying fallback data.`;
    logger.error(finalErrorMessage, { originalDbError: dbError });
    throw new Error(finalErrorMessage); // Re-throw critical error
  }
}

// Interface for Yahoo Finance Data as returned by yahoo-finance2 and expected by this function
export interface YahooFinanceData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

const YAHOO_SOURCE_API = 'YahooFinance';
const YAHOO_INTERVAL = '1d';
// Cache recency: Use data fetched within the last 12 hours for daily data.
const YAHOO_CACHE_RECENCY_THRESHOLD_SECONDS = 12 * 60 * 60; 

function transformDbRecordToYahooFinanceData(dbRecord: FinancialData): YahooFinanceData {
  return {
    date: new Date(dbRecord.timestamp * 1000), // Convert epoch seconds back to Date
    open: dbRecord.open,
    high: dbRecord.high,
    low: dbRecord.low,
    close: dbRecord.close,
    volume: dbRecord.volume,
    // adjClose is not in FinancialData, so it will be undefined, which is fine.
  };
}

export async function fetchYahooFinanceData(symbol: string): Promise<YahooFinanceData[]> {
  const nowEpochSeconds = Math.floor(Date.now() / 1000);

  // 1. Caching Logic
  try {
    const thresholdTimestamp = nowEpochSeconds - YAHOO_CACHE_RECENCY_THRESHOLD_SECONDS;
    logger.info(`Checking cache for ${symbol} (${YAHOO_SOURCE_API}, ${YAHOO_INTERVAL}) data fetched after ${new Date(thresholdTimestamp * 1000).toISOString()}`);
    const cachedDataRecords = getRecentData(symbol, YAHOO_SOURCE_API, YAHOO_INTERVAL, thresholdTimestamp);

    if (cachedDataRecords.length > 0) {
      logger.info(`Using ${cachedDataRecords.length} cached data records for ${symbol} from ${YAHOO_SOURCE_API} for interval ${YAHOO_INTERVAL}.`);
      return cachedDataRecords
        .map(transformDbRecordToYahooFinanceData)
        .sort((a: YahooFinanceData, b: YahooFinanceData) => b.date.getTime() - a.date.getTime()); // Sort descending by date
    }
    logger.info(`No recent cached data for ${symbol} (${YAHOO_SOURCE_API}, ${YAHOO_INTERVAL}). Fetching from API.`);
  } catch (dbError) {
    logger.error('Error querying cache for Yahoo Finance data:', { symbol, source_api: YAHOO_SOURCE_API, interval: YAHOO_INTERVAL, error: dbError });
    // Proceed to API fetch if cache query fails
  }

  // 2. API Fetch
  try {
    logger.info(`Fetching Yahoo Finance historical data for symbol: ${symbol}`);
    const queryOptions: {
      period1: Date;
      period2: Date;
      interval: "1d" | "1wk" | "1mo"; // Explicitly type interval for YahooFinance
    } = {
      period1: new Date(new Date().setDate(new Date().getDate() - 7)), // 7 days ago, can be parameterized
      period2: new Date(), // today
      interval: YAHOO_INTERVAL as "1d", // Assert YAHOO_INTERVAL as one of the allowed literals
    };
    const results = await yahooFinance.historical(symbol, queryOptions);

    if (!results || results.length === 0) {
      logger.warn(`No data returned from Yahoo Finance API for symbol: ${symbol}. Attempting fallback.`);
      // Attempt to use fallback data if API returns no results (could be a temporary issue or delisted symbol)
      return await handleYahooApiErrorAndFetchFallback(symbol, `No data returned from API`);
    }

    logger.info(`Successfully fetched ${results.length} historical data points for ${symbol} from Yahoo Finance API.`);

    // 3. Store Fetched Data
    const fetched_at = Math.floor(Date.now() / 1000);
    const recordsToStore: FinancialData[] = results.map((item: YahooFinanceData) => ({ // Added type for item
      symbol: symbol,
      timestamp: Math.floor(item.date.getTime() / 1000), // Convert Date to Unix epoch seconds
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
      source_api: YAHOO_SOURCE_API,
      fetched_at: fetched_at,
      interval: YAHOO_INTERVAL,
    }));

    if (recordsToStore.length > 0) {
      try {
        logger.info(`Attempting to store ${recordsToStore.length} records for ${symbol} from ${YAHOO_SOURCE_API}.`);
        insertData(recordsToStore);
        logger.info(`Successfully stored ${recordsToStore.length} records for ${symbol} from ${YAHOO_SOURCE_API}.`);
      } catch (dbError) {
        logger.error('Error storing fetched Yahoo Finance data:', { symbol, source_api: YAHOO_SOURCE_API, error: dbError });
        // Continue to return data even if storage fails, as API call was successful
      }
    }
    return results.sort((a: YahooFinanceData, b: YahooFinanceData) => b.date.getTime() - a.date.getTime()); // Sort descending by date
  } catch (error) {
    let errorMessage = `Error fetching data for symbol ${symbol} from Yahoo Finance API.`;
    if (error instanceof Error) {
      errorMessage += ` Details: ${error.message}`;
    }
    logger.error(errorMessage, { symbol, error });
    // 4. Fallback Logic
    return await handleYahooApiErrorAndFetchFallback(symbol, errorMessage);
  }
}

async function handleYahooApiErrorAndFetchFallback(symbol: string, apiErrorMsg: string): Promise<YahooFinanceData[]> {
  logger.warn(`Yahoo API call failed for ${symbol}: ${apiErrorMsg}. Attempting to use fallback data.`);
  try {
    const fallbackRecords = getFallbackData(symbol, YAHOO_SOURCE_API, YAHOO_INTERVAL);
    if (fallbackRecords.length > 0) {
      logger.info(`Using ${fallbackRecords.length} fallback data records for ${symbol} from ${YAHOO_SOURCE_API} for interval ${YAHOO_INTERVAL}.`);
      return fallbackRecords
        .map(transformDbRecordToYahooFinanceData)
        .sort((a: YahooFinanceData, b: YahooFinanceData) => b.date.getTime() - a.date.getTime()); // Sort descending by date
    }
    const finalErrorMessage = `Yahoo API fetch failed for ${symbol} (${apiErrorMsg}) and no fallback data available.`;
    logger.error(finalErrorMessage);
    // Consistent with original function's behavior of returning empty array or throwing,
    // Here, throwing an error for critical failure. If empty array is preferred, change to: return [];
    throw new Error(finalErrorMessage);
  } catch (dbError) {
    const finalErrorMessage = `Yahoo API fetch failed for ${symbol} (${apiErrorMsg}), and an error occurred while querying fallback data.`;
    logger.error(finalErrorMessage, { originalDbError: dbError });
    // Consistent with original function's behavior
    throw new Error(finalErrorMessage);
  }
}

/*
// --- Example Usage for fetchBinanceData ---
async function testFetchBinance() {
  try {
    // Example: Fetch 1-hour K-line data for BTCUSDT for the last few hours
    const symbol = 'BTCUSDT';
    const interval = '1h'; // 1 minute, 1 hour, 1 day, etc.
    
    // Optional: Fetch data for a specific time range (timestamps in milliseconds)
    // const endTime = Date.now();
    // const startTime = endTime - (24 * 60 * 60 * 1000); // Last 24 hours

    // logger.info(`Fetching ${interval} klines for ${symbol} from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
    // const klines = await fetchBinanceData(symbol, interval, startTime, endTime);
    
    logger.info(`Fetching latest ${interval} klines for ${symbol}`);
    const klines = await fetchBinanceData(symbol, interval);

    if (klines.length > 0) {
      logger.info(`Successfully fetched ${klines.length} klines for ${symbol}.`);
      klines.slice(0, 5).forEach(kline => { // Log first 5 klines
        logger.info(
          `Timestamp: ${new Date(kline.timestamp).toISOString()}, Open: ${kline.open}, High: ${kline.high}, Low: ${kline.low}, Close: ${kline.close}, Volume: ${kline.volume}`
        );
      });
    } else {
      logger.info(`No klines data returned for ${symbol}.`);
    }

    // Example: Fetch 1-day K-line data for ETHBTC
    const symbol2 = 'ETHBTC';
    const interval2 = '1d';
    logger.info(`Fetching latest ${interval2} klines for ${symbol2}`);
    const klines2 = await fetchBinanceData(symbol2, interval2);
    if (klines2.length > 0) {
      logger.info(`Successfully fetched ${klines2.length} klines for ${symbol2}. First kline:`, klines2[0]);
    } else {
      logger.info(`No klines data returned for ${symbol2}.`);
    }

  } catch (error) {
    logger.error('Error in testFetchBinance:', error);
  }
}

// To run this example:
// 1. Ensure you have ts-node installed (npm install -g ts-node) or use your project's runner.
// 2. Uncomment the call to testFetchBinance() below.
// 3. Execute the script, e.g., `ts-node src/services/dataService.ts` (you might need to adjust paths or tsconfig for direct execution).
//    Alternatively, import and call testFetchBinance from another test script.
// testFetchBinance();
*/

// --- New Functionality: Fetching Historical Data from DB ---

export interface HistoricalDataPoint {
  timestamp: number; // Unix epoch seconds
  date: Date;        // Derived from timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  interval: string;
  source_api: string;
  symbol: string;
}

export async function fetchHistoricalDataFromDB(
  symbol: string,
  startDate: Date,
  endDate: Date,
  source_api?: string,
  interval?: string
): Promise<HistoricalDataPoint[]> {
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);

  logger.info(`Fetching historical data from DB for ${symbol}`, {
    startDate, endDate, source_api, interval, startTimestamp, endTimestamp,
  });

  try {
    // Assuming queryHistoricalData will be added to src/database/index.ts
    // and imported appropriately.
    // For now, this will cause a type error until that part is done.
    const rawData: FinancialData[] = queryHistoricalDataFromDB( 
      symbol,
      startTimestamp,
      endTimestamp,
      source_api,
      interval
    );

    if (!rawData || rawData.length === 0) {
      logger.info(`No historical data found in DB for ${symbol} with the given criteria.`);
      return [];
    }

    const historicalData: HistoricalDataPoint[] = rawData.map(record => ({
      timestamp: record.timestamp,
      date: new Date(record.timestamp * 1000),
      open: record.open,
      high: record.high,
      low: record.low,
      close: record.close,
      volume: record.volume,
      interval: record.interval,
      source_api: record.source_api,
      symbol: record.symbol,
    }));

    logger.info(`Successfully fetched ${historicalData.length} historical data points from DB for ${symbol}.`);
    return historicalData; // Already ordered by timestamp ASC by the DB query (assumption)

  } catch (error) {
    logger.error(`Error fetching historical data from DB for ${symbol}:`, { error, symbol, startDate, endDate });
    // Depending on requirements, you might want to throw the error or return an empty array
    throw error; 
  }
}

// --- New Functionality: Fetching Binance K-line Data ---

export interface KlineData {
  timestamp: number; // Kline open time in milliseconds (as per Binance API and for function output)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BINANCE_API_BASE_URL = 'https://api.binance.com/api/v3/klines';
const BINANCE_SOURCE_API = 'Binance';
// Cache recency: Use data fetched within the last 15 minutes for frequently updated data like Binance.
const BINANCE_CACHE_RECENCY_THRESHOLD_SECONDS = 15 * 60;

function transformDbRecordToKlineData(dbRecord: FinancialData): KlineData {
  return {
    timestamp: dbRecord.timestamp * 1000, // Convert DB seconds to API milliseconds
    open: dbRecord.open,
    high: dbRecord.high,
    low: dbRecord.low,
    close: dbRecord.close,
    volume: dbRecord.volume,
  };
}

export async function fetchBinanceData(
  symbol: string,
  interval: string,
  startTime?: number, // Milliseconds
  endTime?: number,   // Milliseconds
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apiKey?: string, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apiSecret?: string
): Promise<KlineData[]> {
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const upperSymbol = symbol.toUpperCase();

  // 1. Caching Logic (only if startTime and endTime are not provided)
  // If specific time range is requested, API should be hit directly to ensure that range is covered.
  // Binance API also has limits on how far back data can be fetched per request.
  // More complex caching for specific ranges could be added later if needed.
  if (startTime === undefined && endTime === undefined) {
    try {
      const thresholdTimestamp = nowEpochSeconds - BINANCE_CACHE_RECENCY_THRESHOLD_SECONDS;
      logger.info(`Checking cache for ${upperSymbol} (${BINANCE_SOURCE_API}, ${interval}) data fetched after ${new Date(thresholdTimestamp * 1000).toISOString()}`);
      const cachedDataRecords = getRecentData(upperSymbol, BINANCE_SOURCE_API, interval, thresholdTimestamp);

      if (cachedDataRecords.length > 0) {
        logger.info(`Using ${cachedDataRecords.length} cached data records for ${upperSymbol} from ${BINANCE_SOURCE_API} for interval ${interval}.`);
        return cachedDataRecords
          .map(transformDbRecordToKlineData)
          .sort((a: KlineData, b: KlineData) => a.timestamp - b.timestamp); // Sort ascending by timestamp (Kline open time)
      }
      logger.info(`No recent cached data for ${upperSymbol} (${BINANCE_SOURCE_API}, ${interval}). Fetching from API.`);
    } catch (dbError) {
      logger.error('Error querying cache for Binance data:', { symbol: upperSymbol, source_api: BINANCE_SOURCE_API, interval, error: dbError });
      // Proceed to API fetch if cache query fails
    }
  } else {
    logger.info(`Specific time range provided for ${upperSymbol} (${BINANCE_SOURCE_API}, ${interval}). Fetching directly from API.`);
  }

  // 2. API Fetch
  const params: Record<string, string | number> = {
    symbol: upperSymbol,
    interval: interval,
  };

  if (startTime) {
    params.startTime = startTime;
  }
  if (endTime) {
    params.endTime = endTime;
  }
  // Binance API default limit is 500, max is 1000.
  // If a large time range is needed, multiple requests might be necessary.
  // For this implementation, we'll use the default or what the API provides for the given range.
  // params.limit = 1000; 

  try {
    logger.info(`Fetching Binance K-line data for symbol: ${upperSymbol}, interval: ${interval}`, { params });
    const response = await axios.get(BINANCE_API_BASE_URL, { params });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawKlines: any[][] = response.data;

    if (!Array.isArray(rawKlines)) {
      const apiErrorMessage = 'Binance API did not return an array for klines';
      logger.error(apiErrorMessage, { responseData: response.data, symbol: upperSymbol, interval });
      // Attempt fallback even for malformed response, as it's an API issue.
      return await handleBinanceApiErrorAndFetchFallback(upperSymbol, interval, startTime, endTime, apiErrorMessage);
    }

    const fetched_at_seconds = Math.floor(Date.now() / 1000);
    const recordsToStore: FinancialData[] = [];
    const transformedApiData: KlineData[] = [];

    for (const kline of rawKlines) {
      const apiTimestampMs = Number(kline[0]);
      const open = parseFloat(kline[1]);
      const high = parseFloat(kline[2]);
      const low = parseFloat(kline[3]);
      const close = parseFloat(kline[4]);
      const volume = parseFloat(kline[5]);

      // Basic validation
      if (isNaN(apiTimestampMs) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        logger.warn(`Skipping record with invalid data from Binance API:`, { kline, symbol: upperSymbol });
        continue;
      }
      
      transformedApiData.push({
        timestamp: apiTimestampMs, // Keep as milliseconds for direct return
        open, high, low, close, volume,
      });
      
      recordsToStore.push({
        symbol: upperSymbol,
        timestamp: Math.floor(apiTimestampMs / 1000), // Convert ms to seconds for DB
        open, high, low, close, volume,
        source_api: BINANCE_SOURCE_API,
        fetched_at: fetched_at_seconds,
        interval: interval,
      });
    }
    
    logger.info(`Successfully fetched and transformed ${transformedApiData.length} K-line data points for ${upperSymbol} from ${BINANCE_SOURCE_API}.`);

    // 3. Store fetched data
    if (recordsToStore.length > 0) {
      try {
        logger.info(`Attempting to store ${recordsToStore.length} records for ${upperSymbol} from ${BINANCE_SOURCE_API}.`);
        insertData(recordsToStore); 
        logger.info(`Successfully stored ${recordsToStore.length} records for ${upperSymbol} from ${BINANCE_SOURCE_API}.`);
      } catch (dbError) {
        logger.error('Error storing fetched Binance data:', { symbol: upperSymbol, source_api: BINANCE_SOURCE_API, error: dbError });
        // Continue to return data even if storage fails, as API call was successful
      }
    }
    
    return transformedApiData.sort((a: KlineData, b: KlineData) => a.timestamp - b.timestamp); // Sort ascending

  } catch (error) {
    let errorMessage = `Error fetching data from Binance API for ${upperSymbol}`;
    if (axios.isAxiosError(error)) {
      errorMessage = `Axios error fetching Binance data for ${upperSymbol}: ${error.message}`;
      logger.error(errorMessage, { 
        url: BINANCE_API_BASE_URL, 
        params,
        responseData: error.response?.data, 
        responseStatus: error.response?.status 
      });
      if (error.response?.data?.msg) {
        errorMessage += `. Server message: ${error.response.data.msg}`;
      }
    } else if (error instanceof Error) {
      errorMessage = `Generic error processing Binance data for ${upperSymbol}: ${error.message}`;
      logger.error(errorMessage, { error });
    } else {
      logger.error('Unknown error fetching Binance data:', { error, symbol: upperSymbol });
    }
    // 4. Fallback Logic
    return await handleBinanceApiErrorAndFetchFallback(upperSymbol, interval, startTime, endTime, errorMessage);
  }
}

async function handleBinanceApiErrorAndFetchFallback(
  symbol: string,
  interval: string,
  startTime?: number, // Milliseconds
  endTime?: number,   // Milliseconds
  apiErrorMsg?: string
): Promise<KlineData[]> {
  logger.warn(`Binance API call failed for ${symbol} (interval: ${interval}, startTime: ${startTime}, endTime: ${endTime}): ${apiErrorMsg || 'Unknown API error'}. Attempting to use fallback data.`);
  try {
    // For fallback, we ignore startTime/endTime and just get the most recent data as per getFallbackData's logic
    // getFallbackData typically fetches data irrespective of 'fetched_at' for a wider fallback range.
    // If specific range fallback is needed, getFallbackData or a new DB query function would need enhancement.
    const fallbackRecords = getFallbackData(symbol, BINANCE_SOURCE_API, interval);
    
    if (fallbackRecords.length > 0) {
      logger.info(`Using ${fallbackRecords.length} fallback data records for ${symbol} from ${BINANCE_SOURCE_API} for interval ${interval}.`);
      const klineData = fallbackRecords
        .map(transformDbRecordToKlineData)
        .sort((a: KlineData, b: KlineData) => a.timestamp - b.timestamp); // Sort ascending

      // If startTime and endTime are provided, we should filter the fallback data to match the requested range.
      // This is a client-side filter on the fallback data.
      if (startTime !== undefined || endTime !== undefined) {
        return klineData.filter(kline => {
          const ts = kline.timestamp; // Already in ms
          const afterStartTime = startTime === undefined || ts >= startTime;
          const beforeEndTime = endTime === undefined || ts <= endTime;
          return afterStartTime && beforeEndTime;
        });
      }
      return klineData;
    }
    const finalErrorMessage = `Binance API fetch failed for ${symbol} (${apiErrorMsg || 'Unknown API error'}) and no fallback data available.`;
    logger.error(finalErrorMessage);
    throw new Error(finalErrorMessage); 
  } catch (dbError) {
    const finalErrorMessage = `Binance API fetch failed for ${symbol} (${apiErrorMsg || 'Unknown API error'}), and an error occurred while querying fallback data.`;
    logger.error(finalErrorMessage, { originalDbError: dbError });
    throw new Error(finalErrorMessage);
  }
}
