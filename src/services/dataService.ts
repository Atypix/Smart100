import axios from 'axios';
import { logger } from '../../utils/logger';
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
        })).sort((a, b) => b.timestamp.localeCompare(a.timestamp)), // Sort descending
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
        quote_asset_volume: undefined, // Alpha Vantage doesn't provide this
        number_of_trades: undefined,   // Alpha Vantage doesn't provide this
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
    
    timeSeriesOutput.sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Sort descending

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
        })).sort((a, b) => b.timestamp.localeCompare(a.timestamp)), // Sort descending
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
        .sort((a, b) => b.date.getTime() - a.date.getTime()); // Sort descending by date
    }
    logger.info(`No recent cached data for ${symbol} (${YAHOO_SOURCE_API}, ${YAHOO_INTERVAL}). Fetching from API.`);
  } catch (dbError) {
    logger.error('Error querying cache for Yahoo Finance data:', { symbol, source_api: YAHOO_SOURCE_API, interval: YAHOO_INTERVAL, error: dbError });
    // Proceed to API fetch if cache query fails
  }

  // 2. API Fetch
  try {
    logger.info(`Fetching Yahoo Finance historical data for symbol: ${symbol}`);
    const queryOptions = {
      period1: new Date(new Date().setDate(new Date().getDate() - 7)), // 7 days ago, can be parameterized
      period2: new Date(), // today
      interval: YAHOO_INTERVAL,
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
    const recordsToStore: FinancialData[] = results.map(item => ({
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
      quote_asset_volume: undefined, // Yahoo Finance doesn't provide this
      number_of_trades: undefined,   // Yahoo Finance doesn't provide this
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
    return results.sort((a, b) => b.date.getTime() - a.date.getTime()); // Sort descending by date
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
        .sort((a, b) => b.date.getTime() - a.date.getTime()); // Sort descending by date
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
  quote_asset_volume?: number;
  number_of_trades?: number;
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
      quote_asset_volume: record.quote_asset_volume,
      number_of_trades: record.number_of_trades,
    }));

    logger.info(`Successfully fetched ${historicalData.length} historical data points from DB for ${symbol}.`);
    return historicalData; // Already ordered by timestamp ASC by the DB query (assumption)

  } catch (error) {
    logger.error(`Error fetching historical data from DB for ${symbol}:`, { error, symbol, startDate, endDate });
    // Depending on requirements, you might want to throw the error or return an empty array
    throw error; 
  }
}

// --- Binance Data Fetching ---

import Binance, { CandleChartResult, CandleChartInterval_LT } from 'binance-api-node';
// FinancialData is already imported at the top of the file by previous changes
// import { insertData, getRecentData, getFallbackData, FinancialData } from '../database';
// logger is already imported at the top of the file by previous changes

// Define the structure for the transformed data we want to return
export interface TransformedBinanceData {
  timestamp: number; // Unix epoch seconds, derived from candle.openTime
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;    // Base asset volume
}

const BINANCE_SOURCE_API = 'Binance';
const BINANCE_CACHE_RECENCY_THRESHOLD_SECONDS = 15 * 60; // 15 minutes

// Helper function to transform FinancialData to TransformedBinanceData
function transformFinancialToBinance(data: FinancialData[]): TransformedBinanceData[] {
  return data.map(record => ({
    timestamp: record.timestamp, // Already in seconds
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume,
  })).sort((a, b) => b.timestamp - a.timestamp); // Sort descending by timestamp
}


export async function fetchBinanceData(
  symbol: string, // e.g., BTCUSDT
  interval: CandleChartInterval_LT, // Use the interval type from the library e.g. '1m', '5m', '1h', '1d'
  startTime?: number, // Optional, Unix epoch milliseconds for API call
  endTime?: number,   // Optional, Unix epoch milliseconds for API call
  limit?: number      // Optional, default 500, max 1000 for API call
): Promise<TransformedBinanceData[]> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const thresholdTimestamp = nowSeconds - BINANCE_CACHE_RECENCY_THRESHOLD_SECONDS;

  logger.info(`Fetching Binance data for ${symbol} interval ${interval}. Cache threshold: ${new Date(thresholdTimestamp * 1000).toISOString()}`, { symbol, interval });

  // 1. Caching Logic
  try {
    const cachedDataRecords = getRecentData(symbol, BINANCE_SOURCE_API, interval, thresholdTimestamp);
    if (cachedDataRecords.length > 0) {
      logger.info(`Using ${cachedDataRecords.length} cached data records for ${symbol} from ${BINANCE_SOURCE_API} for interval ${interval}.`);
      return transformFinancialToBinance(cachedDataRecords);
    }
    logger.info(`No recent cached data for ${symbol} (${BINANCE_SOURCE_API}, ${interval}). Fetching from API.`);
  } catch (dbError) {
    logger.error('Error querying cache for Binance data:', { symbol, source_api: BINANCE_SOURCE_API, interval, error: dbError });
    // Proceed to API fetch if cache query fails
  }

  // 2. API Fetch
  const client = Binance(); // No API key needed for public kline/candlestick data
  try {
    logger.info(`Fetching Binance kline data from API for symbol: ${symbol}`, { interval, startTime, endTime, limit });
    const candles: CandleChartResult[] = await client.candles({
      symbol: symbol.toUpperCase(),
      interval,
      startTime,
      endTime,
      limit: limit || 500,
    });

    if (!candles || candles.length === 0) {
      logger.warn(`No candle data returned from Binance API for symbol ${symbol} with the given parameters. Attempting fallback.`);
      // Even if API returns empty, try fallback as it might contain older data not meeting "recent" criteria but still useful.
      return await handleBinanceApiErrorAndFetchFallback(symbol, interval, 'No data returned from API');
    }

    const transformedApiDataArray: TransformedBinanceData[] = candles.map((candle: CandleChartResult) => ({
      timestamp: Math.floor(candle.openTime / 1000),
      open: parseFloat(candle.open),
      high: parseFloat(candle.high),
      low: parseFloat(candle.low),
      close: parseFloat(candle.close),
      volume: parseFloat(candle.volume),
    }));
    
    logger.info(`Successfully fetched ${transformedApiDataArray.length} data points for ${symbol} from Binance API.`);

    // 3. Store Fetched Data
    // 3. Store Fetched Data
    // The transformedApiDataArray is for returning, financialDataToStore is for DB
    const financialDataToStore: FinancialData[] = []; 

    for (const candle of candles) {
        const timestampSeconds = Math.floor(candle.openTime / 1000);
        financialDataToStore.push({
            symbol: symbol,
            timestamp: timestampSeconds,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close),
            volume: parseFloat(candle.volume),
            quote_asset_volume: parseFloat(candle.quoteAssetVolume), // New field
            number_of_trades: candle.trades,                         // New field
            source_api: BINANCE_SOURCE_API,
            fetched_at: nowSeconds,
            interval: interval,
        });
    }
    
    // The transformedApiDataArray for returning should not include these new fields
    // as per TransformedBinanceData interface. It's built correctly from candles.
    const transformedApiDataArrayForReturn: TransformedBinanceData[] = candles.map((candle: CandleChartResult) => ({
      timestamp: Math.floor(candle.openTime / 1000),
      open: parseFloat(candle.open),
      high: parseFloat(candle.high),
      low: parseFloat(candle.low),
      close: parseFloat(candle.close),
      volume: parseFloat(candle.volume),
    }));


    logger.info(`Successfully fetched ${candles.length} data points for ${symbol} from Binance API.`);
    
    if (financialDataToStore.length > 0) {
      try {
        logger.info(`Attempting to store ${financialDataToStore.length} records for ${symbol} from ${BINANCE_SOURCE_API}.`);
        insertData(financialDataToStore);
        logger.info(`Successfully stored ${financialDataToStore.length} records for ${symbol} from ${BINANCE_SOURCE_API}.`);
      } catch (dbError) {
        logger.error('Error storing fetched Binance data:', { symbol, source_api: BINANCE_SOURCE_API, error: dbError });
        // Continue to return data even if storage fails, as API call was successful
      }
    }
    return transformedApiDataArrayForReturn.sort((a, b) => b.timestamp - a.timestamp); // Sort descending

  } catch (error: any) {
    const errorMessage = error && typeof error === 'object' && error.message ? error.message : 'Unknown API error';
    logger.error(`Error fetching data from Binance API for ${symbol}: ${errorMessage}`, { originalError: error, symbol, interval });
    // 4. Fallback Logic
    return await handleBinanceApiErrorAndFetchFallback(symbol, interval, `API Error: ${errorMessage}`);
  }
}

async function handleBinanceApiErrorAndFetchFallback(
  symbol: string,
  interval: CandleChartInterval_LT,
  apiErrorMsg: string
): Promise<TransformedBinanceData[]> {
  logger.warn(`Binance API call failed for ${symbol} (${interval}): ${apiErrorMsg}. Attempting to use fallback data.`);
  try {
    const fallbackRecords = getFallbackData(symbol, BINANCE_SOURCE_API, interval);
    if (fallbackRecords.length > 0) {
      logger.info(`Using ${fallbackRecords.length} fallback data records for ${symbol} from ${BINANCE_SOURCE_API} for interval ${interval}.`);
      return transformFinancialToBinance(fallbackRecords);
    }
    const finalErrorMessage = `Binance API fetch failed for ${symbol} (${apiErrorMsg}) and no fallback data available.`;
    logger.error(finalErrorMessage);
    throw new Error(finalErrorMessage);
  } catch (dbError) {
    const finalErrorMessage = `Binance API fetch failed for ${symbol} (${apiErrorMsg}), and an error occurred while querying fallback data.`;
    logger.error(finalErrorMessage, { originalDbError: dbError });
    throw new Error(finalErrorMessage);
  }
}
