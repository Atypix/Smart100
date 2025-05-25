# Project Tracking: Financial Data Engine with Caching and Backtesting

This document tracks the progress and future direction of the project to implement a robust financial data engine with local caching, data archiving, and backtesting capabilities.

## I. Core Feature Implementation (Completed)

1.  **Setup SQLite Database Integration:**
    *   Installed `better-sqlite3` for Node.js.
    *   Created `src/database/index.ts` to manage database connection (to `trading_data.db`) and schema initialization.

2.  **Define Database Schema:**
    *   Designed and implemented a `financial_data` table to store time-series data (symbol, timestamp, OHLCV, source_api, fetched_at, interval).
    *   Established appropriate indexes for efficient querying.

3.  **Modify `dataService.ts` for Caching and Archiving:**
    *   Enhanced `fetchAlphaVantageData` and `fetchYahooFinanceData` to:
        *   Attempt to retrieve recent data from SQLite before an API call (fallback cache).
        *   Store data fetched from APIs into SQLite (historical archive).
        *   If an API call fails, return the most recent data available from SQLite.

4.  **Implement Data Retrieval for Backtesting:**
    *   Added `fetchHistoricalDataFromDB` in `dataService.ts` to allow the backtesting engine to read exclusively from the SQLite database based on symbol, date range, source, and interval.

5.  **Develop Backtesting Module (`src/backtest/index.ts`):**
    *   Implemented a core `runBacktest` function.
    *   Defined interfaces for strategies, portfolio management, trades, and backtest results.
    *   Included a `simpleThresholdStrategy` as an initial example strategy.

6.  **Add Binance API Integration (Optional - Future Step):**
    *   (Skipped for now, can be revisited)

7.  **Testing:**
    *   Developed unit tests for:
        *   Database interaction functions (`src/database/database.test.ts`).
        *   Data service functionalities including caching and fallback (`src/services/dataService.test.ts`).
        *   Backtesting engine logic (`src/backtest/backtest.test.ts`).

## II. Documentation (Current)

*   Update `README.md` with details on new features, setup, and usage.
*   Create this `PROJECT_TRACKING.md` file.
*   Add general guidance on deployment (including considerations for AWS).

## III. Future Development Ideas

*   **Binance API Integration:** Implement `fetchBinanceData` and integrate with caching/archiving.
*   **Advanced Strategies:** Develop and integrate more sophisticated trading strategies.
*   **Configuration:** Make parameters like cache TTL, API keys (beyond .env), and strategy settings more configurable.
*   **Data Visualization:** Integrate a charting library to visualize backtest results or historical data.
*   **User Interface:** Develop a simple UI for initiating backtests or viewing data.
*   **Real-time Data:** Explore integration with real-time data streams for paper trading or live alerts.
*   **Portfolio Management Enhancements:** More detailed tracking of portfolio performance, risk metrics.
*   **Task Scheduling:** Implement automated tasks for regular data fetching and archiving (e.g., using cron jobs or a task scheduler).
*   **Enhanced Deployment Scripts:** Provide Dockerfiles or more specific deployment scripts for platforms like AWS.
*   **API for Backtester:** Expose the backtesting functionality via an API endpoint.
