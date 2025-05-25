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
    *   **Implement Binance API Integration for K-line Data:**
        *   Developed `fetchBinanceData` in `src/services/dataService.ts` to fetch historical K-line/candlestick data from the Binance API.
        *   Integrated this function with the existing SQLite caching and archiving system.
        *   Added comprehensive unit tests for `fetchBinanceData`.
        *   Updated related documentation.
    *   **Implement Dynamic Trading Strategy Framework:**
        *   Defined standardized TypeScript interfaces (`TradingStrategy`, `StrategyContext`, `StrategySignal`, `StrategyParameterDefinition`) in `src/strategies/strategy.types.ts`.
        *   Created `StrategyManager` (`src/strategies/strategyManager.ts`) for registering and retrieving strategies by ID.
        *   Refactored `runBacktest` in `src/backtest/index.ts` to use `strategyId` and `strategyParams`, loading strategies via the `StrategyManager`.
        *   Added unit tests for the `StrategyManager` and updated `runBacktest` tests.
    *   **Implement Ichimoku Cloud Strategy:**
        *   Developed `ichimokuCloudStrategy` in `src/strategies/implementations/ichimokuStrategy.ts`, including manual calculation of Ichimoku components.
        *   Registered the strategy with the `StrategyManager`.
        *   Added unit tests for the `ichimokuCloudStrategy` logic.
    *   **Implement JSON-based Backtest Configuration:**
        *   Created `backtestConfig.json` in the project root to define multiple backtest scenarios.
        *   Developed `src/executeBacktestFromJson.ts` script to read the JSON config, execute backtests, and log results.
        *   Added an `npm run backtest:json` script to `package.json`.
    *   **Develop Web UI for Strategy Configuration & Backtesting (React, Vite):**
        *   Set up a new React + TypeScript frontend application in the `/frontend` directory using Vite.
        *   Implemented core UI components (`StrategySelector`, `StrategyParameterForm`, `BacktestSettingsForm`, `ResultsDisplay`, `BacktestRunnerPage`).
        *   Developed backend API endpoints (`GET /api/strategies`, `POST /api/backtest`) to support the UI.
        *   Added basic CSS styling and UX improvements for the frontend.
        *   Included unit/integration tests for the new API endpoints and key frontend components.

## II. Documentation (Completed)

*   Updated `README.md` with details on new features (Strategy Framework, Ichimoku, JSON backtest execution, Frontend UI, Backend APIs), setup, and usage.
*   Updated this `PROJECT_TRACKING.md` file to reflect completed items and new future ideas.
*   Added general guidance on deployment (including considerations for AWS) to `README.md`.

## III. Future Development Ideas

*   **Advanced Strategies:** Develop and integrate more sophisticated trading strategies (e.g., RSI + Bollinger Bands, MACD-based).
*   **Configuration Enhancements:**
    *   Make parameters like cache TTL, API keys (beyond .env) more configurable, potentially via a central config file or UI.
    *   Store strategy configurations and parameters in the database (e.g., for saved user preferences).
*   **UI/UX Enhancements (Frontend):**
    *   **Data Visualization:** Integrate a charting library (e.g., Recharts, Chart.js) to visualize backtest results (equity curves, trade markers on price charts).
    *   **Advanced Parameter Inputs:** More sophisticated input controls for strategy parameters (e.g., sliders for numbers, specific format validations).
    *   **State Management:** Implement more robust state management (e.g., Context API, Zustand, Redux Toolkit) if the frontend complexity grows.
    *   **Component Library:** Consider using a component library (e.g., Material-UI, Chakra UI) for a more polished look and feel.
    *   **User Accounts:** Allow users to save and manage their backtest configurations and results.
*   **Real-time Data & Paper Trading:** Explore integration with real-time data streams for paper trading or live alerts.
*   **Portfolio Management Enhancements:** More detailed tracking of portfolio performance, risk metrics (Sharpe, Sortino, Max Drawdown), and position sizing.
*   **Task Scheduling:** Implement automated tasks for regular data fetching and archiving.
*   **Enhanced Deployment Scripts:** Provide Dockerfiles or more specific deployment scripts for platforms like AWS.
*   **API for Backtester:** Further develop the API, potentially adding features like saving/loading configurations, retrieving past results, etc.
*   **Indicator Library Integration:** Re-evaluate or explore more comprehensive TA libraries that might include Ichimoku and other complex indicators directly, or contribute to existing ones.
