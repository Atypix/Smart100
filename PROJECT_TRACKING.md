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
    *   Implemented on-demand fetching in `fetchHistoricalDataFromDB` for Binance if data is missing locally (later enhanced for completeness check).

4.  **Implement Data Retrieval for Backtesting:**
    *   Added `fetchHistoricalDataFromDB` in `dataService.ts` to allow the backtesting engine to read exclusively from the SQLite database based on symbol, date range, source, and interval. (Enhanced with completeness checks and more robust on-demand fetching).

5.  **Develop Backtesting Module (`src/backtest/index.ts`):**
    *   Implemented a core `runBacktest` function.
    *   Defined interfaces for strategies, portfolio management, trades, and backtest results.
    *   Included a `simpleThresholdStrategy` as an initial example strategy.
    *   Enhanced logging for backtest completion, with specific messages for no-trade scenarios.

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

8.  **User Authentication System (Completed):**
    *   **Backend:**
        *   Created `users` table in SQLite for persistent user storage (schema in `src/database/index.ts`).
        *   Updated `src/services/userService.ts` to interact with the `users` table for CRUD operations.
        *   Enhanced `src/api/authRoutes.ts` (`/api/auth/register`, `/api/auth/login`) to use the persistent user service, providing JWT-based authentication.
    *   **Frontend:**
        *   Developed `frontend/src/components/LoginPage.tsx` and `frontend/src/components/RegisterPage.tsx` for user interaction.
        *   Implemented `loginUser`, `registerUser`, and `logoutUser` functions in `frontend/src/services/api.ts` to communicate with backend auth endpoints.
        *   Added authentication state management (`isAuthenticated`, `currentView`) and conditional rendering in `frontend/src/App.tsx`.
        *   Protected application routes/views (`ApiKeyManager`, `BacktestRunnerPage`) to be accessible only after login.
    *   **Testing:**
        *   Added backend unit tests for `userService.ts` (`tests/services/userService.test.ts`).
        *   Added backend integration tests for `authRoutes.ts` (`tests/api/auth.test.ts`).
        *   Added frontend unit tests for `LoginPage.tsx`, `RegisterPage.tsx`, and authentication functions in `frontend/src/services/api.test.ts`.

9.  **API Key Management (Completed):**
    *   **Backend:**
        *   Created `api_keys` table in SQLite, linked to the `users` table with a foreign key, and designed to store encrypted API credentials.
        *   Developed `src/services/apiKeyService.ts` providing CRUD operations for API keys, featuring AES-256-GCM encryption for `api_key` and `api_secret` fields using an `API_ENCRYPTION_KEY` environment variable.
        *   Added secure API routes in `src/api/apiKeyRoutes.ts` (mounted under `/api/keys`) for managing API keys, protected by JWT authentication.
    *   **Frontend:**
        *   Developed `frontend/src/components/ApiKeyManager.tsx` component allowing users to view, add, edit (name only, key/secret re-entry for changes), and delete their API keys.
        *   Integrated API calls for these operations into `frontend/src/services/api.ts`.
    *   **Testing:**
        *   Added backend unit tests for `apiKeyService.ts` (`tests/services/apiKeyService.test.ts`).
        *   Added backend integration tests for `apiKeyRoutes.ts` (`tests/api/apiKeyRoutes.test.ts`).
        *   Added frontend unit tests for `ApiKeyManager.tsx` (`frontend/src/components/ApiKeyManager.test.tsx`).
    *   **Documentation & Setup:**
        *   Updated `.env.example` to include `API_ENCRYPTION_KEY` and `JWT_SECRET`.
        *   Documented new API endpoints in `README.md`.

10. **Implement AI Meta-Strategy (AIStrategySelector) (Completed):**
    *   Developed `AISelectorStrategy` (`src/strategies/implementations/aiSelectorStrategy.ts`) that dynamically chooses an underlying strategy based on recent simulated performance over a configurable lookback period.
    *   Added `GET /api/ai/current-strategy/:symbol` endpoint (`src/api/aiRoutes.ts`) to expose the AI's current choice for a given symbol.
    *   Integrated display of the AI's choice into the frontend's `BacktestRunnerPage.tsx` when the `ai-selector` strategy is selected, showing loading states, errors, and the chosen strategy's name and ID.
    *   Added backend unit tests for `AISelectorStrategy` (`tests/strategies/aiSelectorStrategy.test.ts`).
    *   Added backend integration tests for the new API endpoint (`tests/api/aiRoutes.test.ts`).

## II. Documentation (Completed)

*   Updated `README.md` with details on new features (Strategy Framework, Ichimoku, JSON backtest execution, Frontend UI, Backend APIs, User Authentication, API Key Management), setup, and usage.
*   Updated this `PROJECT_TRACKING.md` file to reflect completed items and new future ideas.
*   Added general guidance on deployment (including considerations for AWS) to `README.md`.
*   Code review and backend routing refactor: Standardized all backend API endpoints under the `/api` prefix for consistency. Cleaned up minor frontend code issues. Updated `README.md` to reflect these changes and ensure accuracy of documented API endpoints and available strategies.
*   Documented considerations for the on-demand data fetching feature in `docs/on_demand_fetching_considerations.txt`.

## III. Future Development Ideas & Recently Completed Phases

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
*   **Enhance `AISelectorStrategy`:** Improve with more sophisticated evaluation metrics (e.g., Sharpe ratio over lookback, risk-adjusted returns) or even lightweight machine learning models for selection if performance allows. Consider allowing the AI Selector to use non-default parameters for candidate strategies during its evaluation phase.
*   **Smart Strategy Suggestion Feature:**
    *   **Goal:** Allow users to get an AI-powered suggestion for a trading strategy and capital-adjusted parameters (especially `tradeAmount`) based on a chosen symbol and their initial capital. Aim for a "2-click" style interaction to run a backtest with this suggestion.
    *   **Core Components (MVP):**
        *   Frontend: UI for inputting symbol/capital, displaying suggestions, triggering a backtest with suggested settings (including "Apply & Run" and "Apply to Main Config" buttons).
        *   Backend: A new API endpoint (`/api/ai/suggest-strategy`).
        *   Backend: A new service (`aiSuggestionService.ts`) that leverages `AISelectorStrategy`, fetches recent price via `getMostRecentClosePrice`, and adjusts `tradeAmount`.
    *   **Status:** Phase 1 (MVP) Completed.
    *   **UX Enhancements (Phase 1):**
        *   **Description:** Improved user experience for the strategy suggestion feature, including:
            - An 'Appliquer aux Paramètres' (Apply to Main Config) button to load suggestions into the main form.
            - Enhanced clarity in the suggestion display with more contextual information (e.g., capital adjustment explanation).
            - Frontend UI text and backend messages for this feature localized to French.
        *   **Status:** Completed.
    *   **UX Enhancements (Phase 2):**
        *   **Description:** Further improved the strategy suggestion UX by:
            - Exposing AI evaluation details: The backend now provides the `evaluationScore` and `evaluationMetricUsed` from `AISelectorStrategy`.
            - Displaying AI evaluation details: The frontend now shows these metrics (in French) to the user, offering more transparency into the suggestion.
            - Adding a 'Risk Percentage per Transaction' input: Users can now specify what percentage of their capital should be considered for trade sizing.
            - Backend logic updated to use this risk percentage for `tradeAmount` adjustment.
            - Frontend passes this risk percentage to the API.
            - Updated the French explanation message for capital adjustment to include the risk percentage.
            - Improved data fetching robustness for AI suggestions: `fetchHistoricalDataFromDB` now checks for full date range coverage (not just emptiness) before attempting on-demand fetches, ensuring the AI's lookback period is more reliably populated.
        *   **Status:** Completed.

## IV. Technical Debt / Issues

*   **Address widespread TypeScript compilation errors in the test suite:** Current tests (`npm test`) are largely failing due to numerous TS compilation errors, preventing effective automated testing. This requires a dedicated effort to fix type definitions, imports, and related issues across most test files.

## V. Recent Fixes & Progress

*   **TypeScript Compilation Errors (Test Suite & Main Code):**
    *   Resolved a significant number of initial TypeScript compilation errors throughout the test suite and main codebase, particularly in strategy-related files, API routes, and services. This has improved overall code health and testability. (Batches 1, 2, 6).
    *   Fixed `TS2307` (Cannot find module) and `TS2769` (No overload matches this call) errors in `src/api/aiRoutes.ts` by correcting import paths and ensuring proper `RequestHandler` casting for route handlers. (Batch 6).
*   **Global Logger Mocking Implemented:** A global mock for the logging utility was created (`tests/setupMocks.ts`) and integrated via `jest.config.js` (`setupFilesAfterEnv`). This resolved `TypeError` issues related to the logger in various test suites. (Batch 4).
*   **Test Suite Fixes:**
    *   `tests/services/userService.test.ts`: Passed after robust timestamp comparisons. (Batch 3 & 5).
    *   `tests/api/auth.test.ts`: Auth routes pass after correcting request paths. (Batch 4).
    *   `tests/api/aiRoutes.test.ts`: Largely passes; logger mock and 404 expectation adjustment. (Batch 4).
*   **Ongoing Issue with `apiKeyService.ts` Environment Variable:**
    *   `API_ENCRYPTION_KEY_HEX` loading issue for tests persists, though a workaround (dummy key in test mode) prevents test runner crashes and allows other tests in the file to pass.
*   **Backtest API & UI Integration:**
    *   Resolved Backtest API 404 error by implementing `/api/backtest` endpoint and related type definitions.
    *   Enhanced `BacktestSettingsForm.tsx` with `sourceApi` dropdown.
*   **Data Service Enhancements:**
    *   Added `getMostRecentClosePrice` to `dataService.ts`.
    *   Enhanced `fetchHistoricalDataFromDB` in `dataService.ts` for more robust on-demand fetching, including data completeness checks before fetching.
*   **Smart Strategy Suggestion Feature (MVP + UX Phases 1 & 2):**
    *   **Backend:** Created `aiSuggestionService.ts` (using `AISelectorStrategy`, price fetching, capital/risk-based `tradeAmount` adjustment), added `/api/ai/suggest-strategy` endpoint. `AISelectorStrategy` now stores and exposes evaluation metrics.
    *   **Frontend:** `BacktestRunnerPage.tsx` updated with UI for capital & risk percentage input, suggestion display (including AI eval metrics & capital adjustment explanation), "Apply & Run", and "Appliquer aux Paramètres" buttons. Feature localized to French.
*   **Logging & Documentation:**
    *   Improved `runBacktest` logging for no-trade scenarios.
    *   Added `docs/on_demand_fetching_considerations.txt`.
    *   Reviewed and confirmed adequacy of logging for AI suggestion data fetching scenarios.

```
**Note on Section V updates**: I've consolidated some items in Section V for brevity and clarity, grouping related fixes.
```
