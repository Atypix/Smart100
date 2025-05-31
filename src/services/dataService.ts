import axios from 'axios';
import logger from '../utils/logger';
import { logSafeError } from '../utils/safeLogger';
import yahooFinance from 'yahoo-finance2';
import { insertData, getRecentData, getFallbackData, FinancialData, queryHistoricalData as queryHistoricalDataFromDB } from '../database';

interface AlphaVantageTimeSeriesData {
  [timestamp: string]: {
    '1. open': string;
    '2. high': string;
    '3. low': string;
    '4. close': string;
    '5. volume': string;
  };
}

export interface TimeSeriesData {
  symbol: string;
  interval: string;
  timeSeries: CandlestickData[];
}

export interface CandlestickData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AlphaVantageError {
  'Error Message'?: string;
  'Information'?: string;
}

function isAlphaVantageError(data: any): data is AlphaVantageError {
  return data && (typeof data['Error Message'] === 'string' || typeof data['Information'] === 'string');
}

const CACHE_RECENCY_THRESHOLD_SECONDS = 15 * 60;

export async function fetchAlphaVantageData(symbol: string, apiKey: string): Promise<TimeSeriesData | null> {
  const functionName = 'TIME_SERIES_INTRADAY';
  const interval = '5min';
  const outputsize = 'compact';
  const source_api = 'AlphaVantage';
  const nowEpochSeconds = Math.floor(Date.now() / 1000);

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
        })).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      };
    }
    logger.info(`No recent cached data for ${symbol} (${source_api}, ${interval}). Fetching from API.`);
  } catch (dbError) {
    logger.error('Error querying cache:', { symbol, source_api, interval, error: dbError });
  }

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
      if (isNaN(recordTimestamp)) {
        logger.warn(`Skipping record with invalid timestamp string: ${timestampStr} for symbol ${symbol}`);
        continue;
      }
      const record: FinancialData = {
        symbol: symbol, timestamp: recordTimestamp, open: parseFloat(values['1. open']), high: parseFloat(values['2. high']), low: parseFloat(values['3. low']), close: parseFloat(values['4. close']), volume: parseInt(values['5. volume'], 10), source_api: source_api, fetched_at: fetched_at, interval: interval,
      };
      recordsToStore.push(record);
      timeSeriesOutput.push({
        timestamp: timestampStr, open: record.open, high: record.high, low: record.low, close: record.close, volume: record.volume,
      });
    }
    
    logger.info(`Successfully fetched ${Object.keys(timeSeriesApi).length} time series entries for symbol: ${symbol} from API.`);

    if (recordsToStore.length > 0) {
      try {
        logger.info(`Attempting to store ${recordsToStore.length} records for ${symbol} from ${source_api}.`);
        insertData(recordsToStore);
        logger.info(`Successfully stored ${recordsToStore.length} records for ${symbol} from ${source_api}.`);
      } catch (dbError) {
        logger.error('Error storing fetched data:', { symbol, source_api, error: dbError });
      }
    }
    
    timeSeriesOutput.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return { symbol: symbol, interval: interval, timeSeries: timeSeriesOutput };

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
  let fallbackRecords: FinancialData[] = [];
  let errorDuringFallbackQuery: Error | null = null;

  try {
    fallbackRecords = getFallbackData(symbol, source_api, interval);
  } catch (dbErrorCaught) {
    logger.error(`Error during getFallbackData call for ${symbol} (${source_api}, ${interval}). Details:`, dbErrorCaught);
    errorDuringFallbackQuery = dbErrorCaught instanceof Error ? dbErrorCaught : new Error(String(dbErrorCaught));
  }

  if (errorDuringFallbackQuery) {
    const finalErrorMessage = `API fetch failed for ${symbol} (${apiErrorMsg}), and an error occurred while querying fallback data.`;
    logger.error(finalErrorMessage, { originalDbError: errorDuringFallbackQuery });
    throw new Error(finalErrorMessage);
  }

  if (fallbackRecords && fallbackRecords.length > 0) {
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
      })).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    };
  } else {
    const noFallbackMsg = `API fetch failed for ${symbol} (${apiErrorMsg}) and no fallback data available.`;
    logger.error(noFallbackMsg); 
    throw new Error(noFallbackMsg);
  }
}

export interface YahooFinanceData {
  date: Date; open: number; high: number; low: number; close: number; volume: number; adjClose?: number;
}

const YAHOO_SOURCE_API = 'YahooFinance';
const YAHOO_INTERVAL = '1d';
const YAHOO_CACHE_RECENCY_THRESHOLD_SECONDS = 12 * 60 * 60; 

function transformDbRecordToYahooFinanceData(dbRecord: FinancialData): YahooFinanceData {
  return {
    date: new Date(dbRecord.timestamp * 1000), open: dbRecord.open, high: dbRecord.high, low: dbRecord.low, close: dbRecord.close, volume: dbRecord.volume,
  };
}

export async function fetchYahooFinanceData(symbol: string): Promise<YahooFinanceData[]> {
  const nowEpochSeconds = Math.floor(Date.now() / 1000);

  try {
    const thresholdTimestamp = nowEpochSeconds - YAHOO_CACHE_RECENCY_THRESHOLD_SECONDS;
    logger.info(`Checking cache for ${symbol} (${YAHOO_SOURCE_API}, ${YAHOO_INTERVAL}) data fetched after ${new Date(thresholdTimestamp * 1000).toISOString()}`);
    const cachedDataRecords = getRecentData(symbol, YAHOO_SOURCE_API, YAHOO_INTERVAL, thresholdTimestamp);
    if (cachedDataRecords.length > 0) {
      logger.info(`Using ${cachedDataRecords.length} cached data records for ${symbol} from ${YAHOO_SOURCE_API} for interval ${YAHOO_INTERVAL}.`);
      return cachedDataRecords.map(transformDbRecordToYahooFinanceData).sort((a, b) => b.date.getTime() - a.date.getTime());
    }
    logger.info(`No recent cached data for ${symbol} (${YAHOO_SOURCE_API}, ${YAHOO_INTERVAL}). Fetching from API.`);
  } catch (dbError) {
    logger.error('Error querying cache for Yahoo Finance data:', { symbol, source_api: YAHOO_SOURCE_API, interval: YAHOO_INTERVAL, error: dbError });
  }

  try {
    logger.info(`Fetching Yahoo Finance historical data for symbol: ${symbol}`);
    const queryOptions = {
      period1: new Date(new Date().setDate(new Date().getDate() - 7)), period2: new Date(), interval: YAHOO_INTERVAL as "1d",
    };
    const results = await yahooFinance.historical(symbol, queryOptions);

    if (!results || results.length === 0) {
      logger.warn(`No data returned from Yahoo Finance API for symbol: ${symbol}. Attempting fallback.`);
      return await handleYahooApiErrorAndFetchFallback(symbol, `No data returned from API`);
    }
    logger.info(`Successfully fetched ${results.length} historical data points for ${symbol} from Yahoo Finance API.`);

    const fetched_at = Math.floor(Date.now() / 1000);
    const recordsToStore: FinancialData[] = results.map((item: YahooFinanceData) => ({
      symbol: symbol, timestamp: Math.floor(item.date.getTime() / 1000), open: item.open, high: item.high, low: item.low, close: item.close, volume: item.volume, source_api: YAHOO_SOURCE_API, fetched_at: fetched_at, interval: YAHOO_INTERVAL,
    }));

    if (recordsToStore.length > 0) {
      try {
        logger.info(`Attempting to store ${recordsToStore.length} records for ${symbol} from ${YAHOO_SOURCE_API}.`);
        insertData(recordsToStore);
        logger.info(`Successfully stored ${recordsToStore.length} records for ${symbol} from ${YAHOO_SOURCE_API}.`);
      } catch (dbError) {
        logger.error('Error storing fetched Yahoo Finance data:', { symbol, source_api: YAHOO_SOURCE_API, error: dbError });
      }
    }
    return results.sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch (error) {
    let errorMessage = `Error fetching data for symbol ${symbol} from Yahoo Finance API.`;
    if (error instanceof Error) errorMessage += ` Details: ${error.message}`;
    logger.error(errorMessage, { symbol, error });
    return await handleYahooApiErrorAndFetchFallback(symbol, errorMessage);
  }
}

async function handleYahooApiErrorAndFetchFallback(symbol: string, apiErrorMsg: string): Promise<YahooFinanceData[]> {
  logger.warn(`Yahoo API call failed for ${symbol}: ${apiErrorMsg}. Attempting to use fallback data.`);
  let fallbackRecords: FinancialData[] = [];
  let errorDuringFallbackQuery: Error | null = null;

  try {
    fallbackRecords = getFallbackData(symbol, YAHOO_SOURCE_API, YAHOO_INTERVAL);
  } catch (dbErrorCaught) {
    logger.error(`Error during getFallbackData call for Yahoo ${symbol}. Details:`, dbErrorCaught);
    errorDuringFallbackQuery = dbErrorCaught instanceof Error ? dbErrorCaught : new Error(String(dbErrorCaught));
  }

  if (errorDuringFallbackQuery) {
    const finalErrorMessage = `Yahoo API fetch failed for ${symbol} (${apiErrorMsg}), and an error occurred while querying fallback data.`;
    logger.error(finalErrorMessage, { originalDbError: errorDuringFallbackQuery });
    throw new Error(finalErrorMessage);
  }

  if (fallbackRecords && fallbackRecords.length > 0) {
    logger.info(`Using ${fallbackRecords.length} fallback data records for ${symbol} from ${YAHOO_SOURCE_API} for interval ${YAHOO_INTERVAL}.`);
    return fallbackRecords.map(transformDbRecordToYahooFinanceData).sort((a, b) => b.date.getTime() - a.date.getTime());
  } else {
    const finalErrorMessage = `Yahoo API fetch failed for ${symbol} (${apiErrorMsg}) and no fallback data available.`;
    logger.error(finalErrorMessage);
    throw new Error(finalErrorMessage);
  }
}

export async function getMostRecentClosePrice(
  symbol: string,
  sourceApiInput?: string,
  intervalInput?: string
): Promise<number | null> {
  const sourceApi = sourceApiInput?.toLowerCase() || 'binance';
  const interval = intervalInput || '1d';
  logger.info(`Fetching most recent close price for ${symbol} from ${sourceApi} (${interval})`);

  try {
    // Attempt 1: Query DB for the most recent record within a recent window.
    // Query for the last 3 days to catch the latest '1d' point.
    // queryHistoricalDataFromDB returns data sorted ASC by timestamp.
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 3); // 3-day window should be enough for daily or common intervals

    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    let recentDbData = queryHistoricalDataFromDB(symbol, startTimestamp, endTimestamp, sourceApi, interval);

    if (recentDbData && recentDbData.length > 0) {
      const mostRecentRecord = recentDbData[recentDbData.length - 1];
      logger.info(`Found recent price in DB for ${symbol}: ${mostRecentRecord.close} on ${new Date(mostRecentRecord.timestamp * 1000).toISOString()}`);
      return mostRecentRecord.close;
    }

    // Attempt 2: API Fallback if DB is empty for the recent window
    logger.info(`No recent price in DB for ${symbol} from ${sourceApi} (${interval}), attempting API fetch.`);
    let apiFetchAttempted = false;
    if (sourceApi === 'binance') {
      // fetchBinanceData typically fetches a batch (e.g., 500 points if no range) and stores it.
      // We are interested in the most recent point after storage.
      await fetchBinanceData(symbol, interval);
      apiFetchAttempted = true;
    } else if (sourceApi === 'yahoofinance') {
      // fetchYahooFinanceData currently fetches last 7 days and stores it.
      await fetchYahooFinanceData(symbol);
      apiFetchAttempted = true;
    } else {
      logger.warn(`getMostRecentClosePrice: sourceApi '${sourceApi}' not supported for API fallback.`);
      // Do not attempt to re-query if no fetch was made
    }

    if (apiFetchAttempted) {
      // After fetching, query DB again for the most recent point in the same recent window.
      recentDbData = queryHistoricalDataFromDB(symbol, startTimestamp, endTimestamp, sourceApi, interval);
      if (recentDbData && recentDbData.length > 0) {
        const mostRecentRecord = recentDbData[recentDbData.length - 1];
        logger.info(`Fetched via API and found recent price for ${symbol}: ${mostRecentRecord.close} on ${new Date(mostRecentRecord.timestamp * 1000).toISOString()}`);
        return mostRecentRecord.close;
      }
    }

    logger.warn(`No price data found for ${symbol} from ${sourceApi} (${interval}) after DB query and API fallback.`);
    return null;

  } catch (error) {
    logger.error(`Error in getMostRecentClosePrice for ${symbol} (${sourceApi}, ${interval}):`, error);
    return null;
  }
}

export interface HistoricalDataPoint {
  timestamp: number; date: Date; open: number; high: number; low: number; close: number; volume: number; interval: string; source_api: string; symbol: string;
}

export async function fetchHistoricalDataFromDB(
  symbol: string, startDate: Date, endDate: Date, source_api?: string, interval?: string
): Promise<HistoricalDataPoint[]> {
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);
  logger.info(`Fetching historical data from DB for ${symbol}`, { startDate, endDate, source_api, interval, startTimestamp, endTimestamp });
  try {
    let rawData: FinancialData[] = queryHistoricalDataFromDB(symbol, startTimestamp, endTimestamp, source_api, interval);
    logger.info(`[DataService] Initial DB query for ${symbol} (${source_api}/${interval}) from ${startDate.toISOString()} to ${endDate.toISOString()} found ${rawData.length} records.`);

    const dataIsPresent = rawData && rawData.length > 0;
    // Note: queryHistoricalDataFromDB sorts by timestamp ASC.
    const coversStartDate = dataIsPresent && rawData[0].timestamp <= startTimestamp;
    // For coversEndDate, we need to be careful if interval is e.g. daily.
    // The last data point's timestamp should be on or after the start of the endDate's day.
    // A simple >= endTimestamp check might be too strict if endTimestamp is end of day.
    // For daily data, if last point's date is same or after endDate's date, it's likely covered.
    // For simplicity now, using a direct comparison, but this might need refinement for different intervals.
    const coversEndDate = dataIsPresent && rawData[rawData.length - 1].timestamp >= endTimestamp;

    // A simple sufficiency check for now: are the start and end of the requested range covered?
    // This does not check for internal gaps.
    const isDataSufficient = dataIsPresent && coversStartDate && coversEndDate;

    if (!isDataSufficient && source_api && interval) {
      logger.warn(`[DataService] Existing data for ${symbol} (${source_api}/${interval}) is insufficient or incomplete for the range ${startDate.toISOString()} to ${endDate.toISOString()}. (Present: ${dataIsPresent}, CoversStart: ${coversStartDate}, CoversEnd: ${coversEndDate}). Attempting to fetch entire range.`);

      const sourceApiLower = source_api.toLowerCase();
      try {
        if (sourceApiLower === 'binance') {
          logger.info(`[DataService] Fetching from Binance for ${symbol}, interval ${interval}, from ${startDate.toISOString()} to ${endDate.toISOString()}`);
          await fetchBinanceData(symbol, interval, startDate.getTime(), endDate.getTime());
        } else if (sourceApiLower === 'yahoofinance') {
          logger.warn(`[DataService] On-demand ranged fetch for YahooFinance for ${symbol} needs review/implementation for full range. Attempting standard fetch which might not cover the full range.`);
          // Current fetchYahooFinanceData fetches last ~7 days.
          // To make it fetch the required range, fetchYahooFinanceData itself would need modification.
          await fetchYahooFinanceData(symbol); // This will fetch recent, not necessarily the full requested range.
        } else if (sourceApiLower === 'alphavantage') {
            logger.warn(`[DataService] On-demand fetching for AlphaVantage for ${symbol} is not supported for backfill in this flow due to API limitations.`);
        } else {
          logger.warn(`[DataService] On-demand fetching for sourceApi '${source_api}' is not supported for arbitrary ranges or not implemented.`);
        }

        // Re-query after attempting fetch, only if a fetch was relevant for the source
        if (sourceApiLower === 'binance' || sourceApiLower === 'yahoofinance') {
            logger.info(`[DataService] Re-querying DB for ${symbol} (${source_api}/${interval}) after fetch attempt.`);
            rawData = queryHistoricalDataFromDB(symbol, startTimestamp, endTimestamp, source_api, interval);
            logger.info(`[DataService] Found ${rawData.length} records for ${symbol} after fetch and re-query.`);
        }
      } catch (fetchError) {
        logger.error(`[DataService] Error during on-demand fetch for ${symbol} (${source_api}):`, fetchError);
        // rawData remains as it was from the first query (potentially insufficient)
      }
    } else if (isDataSufficient) {
      logger.info(`[DataService] Existing data for ${symbol} (${source_api}/${interval}) from ${startDate.toISOString()} to ${endDate.toISOString()} is considered sufficient. Found ${rawData.length} records.`);
    } else {
      logger.info(`[DataService] Data for ${symbol} (${source_api}/${interval}) from ${startDate.toISOString()} to ${endDate.toISOString()} was not fetched on-demand (source_api or interval missing, or data was present but still insufficient without a fetch rule).`);
    }

    if (!rawData || rawData.length === 0) {
      logger.warn(`[DataService] No historical data found in DB for ${symbol} (${source_api}/${interval}) for the range ${startDate.toISOString()} to ${endDate.toISOString()} after all attempts.`);
      return [];
    }

    const historicalData: HistoricalDataPoint[] = rawData.map(record => ({
      timestamp: record.timestamp, date: new Date(record.timestamp * 1000), open: record.open, high: record.high, low: record.low, close: record.close, volume: record.volume, interval: record.interval, source_api: record.source_api, symbol: record.symbol,
    }));
    logger.info(`Successfully processed ${historicalData.length} historical data points from DB for ${symbol}.`);
    return historicalData;
  } catch (error) {
    logSafeError(logger, `Error processing historical data from DB for ${symbol}`, error, { symbol, startDate: startDate.toISOString(), endDate: endDate.toISOString(), source_api, interval });
    throw error; 
  }
}

export interface KlineData {
  timestamp: number; open: number; high: number; low: number; close: number; volume: number;
}

const BINANCE_API_BASE_URL = 'https://api.binance.com/api/v3/klines';
const BINANCE_SOURCE_API = 'Binance';
const BINANCE_CACHE_RECENCY_THRESHOLD_SECONDS = 15 * 60;

function transformDbRecordToKlineData(dbRecord: FinancialData): KlineData {
  return {
    timestamp: dbRecord.timestamp * 1000, open: dbRecord.open, high: dbRecord.high, low: dbRecord.low, close: dbRecord.close, volume: dbRecord.volume,
  };
}

export async function fetchBinanceData(
  symbol: string, interval: string, startTime?: number, endTime?: number, apiKey?: string, apiSecret?: string
): Promise<KlineData[]> {
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const upperSymbol = symbol.toUpperCase();

  if (startTime === undefined && endTime === undefined) {
    try {
      const thresholdTimestamp = nowEpochSeconds - BINANCE_CACHE_RECENCY_THRESHOLD_SECONDS;
      logger.info(`Checking cache for ${upperSymbol} (${BINANCE_SOURCE_API}, ${interval}) data fetched after ${new Date(thresholdTimestamp * 1000).toISOString()}`);
      const cachedDataRecords = getRecentData(upperSymbol, BINANCE_SOURCE_API, interval, thresholdTimestamp);
      if (cachedDataRecords.length > 0) {
        logger.info(`Using ${cachedDataRecords.length} cached data records for ${upperSymbol} from ${BINANCE_SOURCE_API} for interval ${interval}.`);
        return cachedDataRecords.map(transformDbRecordToKlineData).sort((a, b) => a.timestamp - b.timestamp);
      }
      logger.info(`No recent cached data for ${upperSymbol} (${BINANCE_SOURCE_API}, ${interval}). Fetching from API.`);
    } catch (dbError) {
      logger.error('Error querying cache for Binance data:', { symbol: upperSymbol, source_api: BINANCE_SOURCE_API, interval, error: dbError });
    }
  } else {
    logger.info(`Specific time range provided for ${upperSymbol} (${BINANCE_SOURCE_API}, ${interval}). Fetching directly from API.`);
  }

  const params: Record<string, string | number> = { symbol: upperSymbol, interval: interval };
  if (startTime) params.startTime = startTime;
  if (endTime) params.endTime = endTime;

  try {
    logger.info(`Fetching Binance K-line data for symbol: ${upperSymbol}, interval: ${interval}`, { params });
    const response = await axios.get(BINANCE_API_BASE_URL, { params });
    const rawKlines: any[][] = response.data;

    if (!Array.isArray(rawKlines)) {
      const apiErrorMessage = 'Binance API did not return an array for klines';
      logger.error(apiErrorMessage, { responseData: response.data, symbol: upperSymbol, interval });
      return await handleBinanceApiErrorAndFetchFallback(upperSymbol, interval, startTime, endTime, apiErrorMessage);
    }

    const fetched_at_seconds = Math.floor(Date.now() / 1000);
    const recordsToStore: FinancialData[] = [];
    const transformedApiData: KlineData[] = [];

    for (const kline of rawKlines) {
      const apiTimestampMs = Number(kline[0]);
      const open = parseFloat(kline[1]); const high = parseFloat(kline[2]); const low = parseFloat(kline[3]); const close = parseFloat(kline[4]); const volume = parseFloat(kline[5]);
      if (isNaN(apiTimestampMs) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        logger.warn(`Skipping record with invalid data from Binance API:`, { kline, symbol: upperSymbol });
        continue;
      }
      transformedApiData.push({ timestamp: apiTimestampMs, open, high, low, close, volume });
      recordsToStore.push({
        symbol: upperSymbol, timestamp: Math.floor(apiTimestampMs / 1000), open, high, low, close, volume, source_api: BINANCE_SOURCE_API, fetched_at: fetched_at_seconds, interval: interval,
      });
    }
    
    logger.info(`Successfully fetched and transformed ${transformedApiData.length} K-line data points for ${upperSymbol} from ${BINANCE_SOURCE_API}.`);

    if (recordsToStore.length > 0) {
      try {
        logger.info(`Attempting to store ${recordsToStore.length} records for ${upperSymbol} from ${BINANCE_SOURCE_API}.`);
        insertData(recordsToStore); 
        logger.info(`Successfully stored ${recordsToStore.length} records for ${upperSymbol} from ${BINANCE_SOURCE_API}.`);
      } catch (dbError) {
        logger.error('Error storing fetched Binance data:', { symbol: upperSymbol, source_api: BINANCE_SOURCE_API, error: dbError });
      }
    }
    return transformedApiData.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    let errorMessage = `Error fetching data from Binance API for ${upperSymbol}`;
    if (axios.isAxiosError(error)) {
      errorMessage = `Axios error fetching Binance data for ${upperSymbol}: ${error.message}`;
      logger.error(errorMessage, { url: BINANCE_API_BASE_URL, params, responseData: error.response?.data, responseStatus: error.response?.status });
      if (error.response?.data?.msg) errorMessage += `. Server message: ${error.response.data.msg}`;
    } else if (error instanceof Error) {
      errorMessage = `Generic error processing Binance data for ${upperSymbol}: ${error.message}`;
      logger.error(errorMessage, { error });
    } else {
      logger.error('Unknown error fetching Binance data:', { error, symbol: upperSymbol });
    }
    return await handleBinanceApiErrorAndFetchFallback(upperSymbol, interval, startTime, endTime, errorMessage);
  }
}

async function handleBinanceApiErrorAndFetchFallback(
  symbol: string, interval: string, startTime?: number, endTime?: number, apiErrorMsg?: string
): Promise<KlineData[]> {
  logger.warn(`Binance API call failed for ${symbol} (interval: ${interval}, startTime: ${startTime}, endTime: ${endTime}): ${apiErrorMsg || 'Unknown API error'}. Attempting to use fallback data.`);
  let fallbackRecords: FinancialData[] = [];
  let errorDuringFallbackQuery: Error | null = null;

  try {
    fallbackRecords = getFallbackData(symbol, BINANCE_SOURCE_API, interval);
  } catch (dbErrorCaught) {
    logger.error(`Error during getFallbackData call for Binance ${symbol} (${interval}). Details:`, dbErrorCaught);
    errorDuringFallbackQuery = dbErrorCaught instanceof Error ? dbErrorCaught : new Error(String(dbErrorCaught));
  }

  if (errorDuringFallbackQuery) {
    const finalErrorMessage = `Binance API fetch failed for ${symbol} (${apiErrorMsg || 'Unknown API error'}), and an error occurred while querying fallback data.`;
    logger.error(finalErrorMessage, { originalDbError: errorDuringFallbackQuery });
    throw new Error(finalErrorMessage);
  }
    
  if (fallbackRecords && fallbackRecords.length > 0) {
    logger.info(`Using ${fallbackRecords.length} fallback data records for ${symbol} from ${BINANCE_SOURCE_API} for interval ${interval}.`);
    const klineData = fallbackRecords.map(transformDbRecordToKlineData).sort((a, b) => a.timestamp - b.timestamp);
    if (startTime !== undefined || endTime !== undefined) {
      return klineData.filter(kline => {
        const ts = kline.timestamp;
        const afterStartTime = startTime === undefined || ts >= startTime;
        const beforeEndTime = endTime === undefined || ts <= endTime;
        return afterStartTime && beforeEndTime;
      });
    }
    return klineData;
  } else {
    const finalErrorMessage = `Binance API fetch failed for ${symbol} (${apiErrorMsg || 'Unknown API error'}) and no fallback data available.`;
    logger.error(finalErrorMessage);
    throw new Error(finalErrorMessage);
  }
}
