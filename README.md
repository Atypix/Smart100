# Smart100 - Algorithmic Trading Application

## 1. Project Objective (Objectif Initial)

**Objectif**

Construire une application Node.js en TypeScript capable de transformer un capital initial fixe de 100 € en profits mesurables, en appliquant des algorithmes financiers éprouvés tout en contrôlant strictement le risque.

**Fonctions principales**

*   Collecte de données en temps réel
    *   APIs gratuites ou freemium : Alpha Vantage, Yahoo Finance, Binance (crypto) ; fallback CSV historique.
*   Algorithmes implémentés
    *   Moyennes mobiles croisées (SMA 20/50) pour signaux achat/vente.
    *   RSI 14 pour détection surachat/survente.
    *   Optimisation de portefeuille (Markowitz variance minimale) sur un panier d’ETF à faibles frais.
    *   Stop loss dynamique basé sur ATR × 2.
    *   Gestion de position via Critère de Kelly tronqué (≤ 10 % du capital) pour dimensionner chaque trade.
*   Backtesting
    *   Période : 5 ans minimum.
    *   Indicateurs retournés : CAGR, ratio de Sharpe, drawdown max, % trades gagnants.
*   Paper trading
    *   Exécution simulée via Alpaca Sandbox ou Binance Testnet ; journalisation complète des ordres.
*   Tableau de bord temps réel
    *   Frontend : Next.js 13, React, TypeScript, Tailwind CSS, Recharts.
    *   Visualisations :
        *   Courbe de valeur du portefeuille (historique et temps réel).
        *   Heat map des positions courantes (gain/perte).
        *   Lignes de prévisions (ARIMA/Prophet) superposées.
    *   KPIs clés affichés dans des cards :
        *   Valeur actuelle (€) & ROI %
        *   CAGR annualisé
        *   Ratio de Sharpe
        *   Drawdown maximal
        *   Volatilité 30 j.
    *   Recommandations dynamiques :
        *   Module « Insights » générant conseils d’allocation ou prise de profit basés sur signaux des stratégies et score de confiance.
    *   Notifications toast + email (SendGrid) lorsque :
        *   Stop loss déclenché
        *   Nouvelle opportunité détectée
        *   ROI dépasse un seuil défini.
*   Prévisions :
    *   Modèle ARIMA ou Prophet entraîné quotidiennement sur prix de clôture.
    *   Affichage d’un intervalle de confiance (50 % / 95 %) sur 7 et 30 jours.
*   Tech :
    *   API /metrics exposant JSON d’indicateurs.
    *   WebSocket pour mises à jour temps réel (< 500 ms).
    *   Auth simple JWT pour multi utilisateurs.
*   Sécurité & conformité
    *   Fichier .env pour clés API ; aucune clé en clair.
    *   Disclaimer « Not financial advice » et conformité RGPD pour données utilisateur.
*   Contraintes budgétaires
    *   Capital initial : 100 € (pas de levier).
    *   Frais simulés : 0,1 % par trade.
    *   Risque maximum par position : 2 € (2 % du capital).
*   Architecture & tech stack
    *   100 % TypeScript ; Node >= 20.
    *   Dépendances : axios, ta-lib, mathjs, backtest-js, dotenv, ts-node, jest.
    *   Arborescence :
        src/
          strategies/
          services/
          backtest/
          utils/
        tests/
        scripts/
    *   Qualité : ESLint + Prettier + tests unitaires Jest.


## 2. Current Status: Project Foundation Setup

The initial phase of the project has focused on establishing a robust foundation for the Node.js/TypeScript application. Key accomplishments include:

*   **Project Initialization**:
    *   Set up `package.json` with core dependencies (`typescript`, `axios`, `dotenv`, `winston`, `jest`, etc.).
    *   Configured TypeScript with `tsconfig.json`.
*   **Directory Structure**:
    *   Created a logical folder structure:
        *   `src/`: Main application code (`api/`, `backtest/`, `config/`, `services/`, `strategies/`, `utils/`).
        *   `tests/`: For unit and integration tests.
        *   `scripts/`: For utility scripts.
*   **Code Quality & Formatting**:
    *   Integrated ESLint and Prettier for consistent code style and quality checks.
    *   Configuration files: `.eslintrc.js`, `.prettierrc.js`, `.eslintignore`, `.prettierignore`.
*   **Logging**:
    *   Implemented a basic logging mechanism using Winston (`src/utils/logger.ts`), configured for console output with timestamps and log levels.
*   **Environment Management**:
    *   Set up `dotenv` for managing environment variables.
    *   Created `.env.example` with placeholders for API keys and other sensitive configurations.
*   **Testing Framework**:
    *   Configured Jest for unit testing (`jest.config.js`), including `ts-jest` for TypeScript support.
    *   Added an initial sample utility function (`src/utils/math.ts`) and a corresponding test (`tests/utils/math.test.ts`).
    *   Recent efforts have focused on improving TypeScript stability. The backend codebase (TypeScript files in `src/` and `tests/`) is now confirmed to be free of compilation errors as per `tsc --noEmit`. Issues persist with reliably running backend tests via `npm test` from the project root in the current execution environment. The frontend codebase (`frontend/src/`) still has a number of TypeScript compilation errors, and its test execution setup requires further configuration.
*   **Version Control**:
    *   The project has been initialized as a Git repository, and the foundational setup described above has been committed to the `main` branch.
    *   **Recent Additions (Phase 2):** The application now includes local data caching/archiving via SQLite and a foundational backtesting engine.

## 3. Core Features

*   **Data Collection Services (`src/services/dataService.ts`)**:
    *   Fetches financial data from external APIs: Alpha Vantage (intraday time series), Yahoo Finance (historical daily data), and Binance (cryptocurrency K-line/candlestick data).
    *   The `fetchBinanceData` function specifically fetches historical K-line/candlestick data from Binance. Currently, this uses Binance's public API endpoint for K-lines, which does not strictly require an API key. However, API keys can be configured and might be utilized for other Binance API functionalities or future private endpoint access.
    *   **Financial Data Caching:** Data fetched from these APIs is cached in a local SQLite database (`trading_data.db`). This significantly reduces API calls, helps avoid rate-limiting, and can provide data if an API is temporarily unavailable.
    *   **Historical Data Archive:** All fetched data is stored in the SQLite database, gradually building a local historical archive over time.
    *   **Fallback Mechanism:** If an API call fails, the system attempts to return the most recent relevant data from the local SQLite archive.
*   **Database Integration (`src/database/index.ts`)**:
    *   Uses SQLite (`better-sqlite3` library) for local data storage.
    *   The database file (`trading_data.db`) is automatically created in the project root, and its schema is initialized on application startup if it doesn't exist. No manual database setup is typically required.
    *   Includes tables for `financial_data`, `users`, and `api_keys`.
*   **User Authentication**:
    *   The application features a persistent user account system using email and password.
    *   Registration and login are handled via JWT (JSON Web Tokens) for secure sessions.
    *   Backend components include `src/services/userService.ts` (interacting with the `users` database table) and `src/api/authRoutes.ts` (providing `/api/auth/register` and `/api/auth/login` endpoints).
    *   Frontend components include `frontend/src/components/LoginPage.tsx` and `frontend/src/components/RegisterPage.tsx` for user interaction, with API calls managed in `frontend/src/services/api.ts`.
*   **API Key Management**:
    *   Authenticated users can securely store and manage API keys for external exchanges.
    *   API keys and secrets are encrypted using AES-256-GCM (via `API_ENCRYPTION_KEY` environment variable) before being stored in the `api_keys` database table, which is linked to the `users` table.
    *   Backend services (`src/services/apiKeyService.ts`) and authenticated API routes (`/api/keys`) handle the CRUD operations and encryption/decryption.
    *   The frontend provides an `ApiKeyManager.tsx` component for users to manage their keys.
*   **Backtesting Engine (`src/backtest/index.ts`)**:
    *   Provides a `runBacktest` function to test trading strategies against historical data.
    *   Uses a dynamic strategy loading mechanism via the `StrategyManager`.
    *   Historical data for backtesting is fetched exclusively from the local SQLite database via `fetchHistoricalDataFromDB` in `dataService.ts`.
*   **Trading Strategy Framework (`src/strategies/`)**:
    *   **Core Concept**: The application supports defining and running multiple, distinct trading strategies. Each strategy encapsulates its own logic and parameters.
    *   **`TradingStrategy` Interface (`src/strategies/strategy.types.ts`)**: This is the cornerstone for all strategies. It defines a contract including:
        *   `id`: A unique string identifier (e.g., `'simple-threshold'`, `'ichimoku-cloud'`).
        *   `name`: A user-friendly name (e.g., "Simple Threshold Strategy").
        *   `description`: An optional explanation of the strategy.
        *   `parameters`: An array of `StrategyParameterDefinition` objects, each detailing a configurable parameter (name, label, type, default value, description, min/max/step for numbers).
        *   `execute`: A function `(context: StrategyContext) => StrategySignal` that contains the core logic. It receives market data and portfolio status via `StrategyContext` and returns a `StrategySignal` (BUY, SELL, or HOLD with an optional amount).
    *   **`StrategyManager` (`src/strategies/strategyManager.ts`)**:
        *   Manages the registration and retrieval of all available trading strategies.
        *   Strategies are typically imported into the manager and registered upon application startup.
        *   Provides functions like `getStrategy(id)` to fetch a strategy by its ID and `getAvailableStrategies()` to list all registered strategies.
*   **Logging**:
    *   Comprehensive logging using Winston (`src/utils/logger.ts`) for console output with timestamps and log levels.
*   **Environment Management**:
    *   Uses `dotenv` for managing environment variables (API keys, etc.). See `.env.example`.
*   **Testing Framework**:
    *   Jest is configured for unit and integration testing (`jest.config.js`), with `ts-jest` for TypeScript support.
    *   Tests cover database interactions, data service logic (including caching/fallback), and the backtesting engine.

## 4. Project Structure Highlights

Key directories and files, including recent additions:

*   `src/`: Main application code.
    *   `database/index.ts`: Manages SQLite database connection, schema, and data access functions.
    *   `services/dataService.ts`: Handles fetching data from external APIs and interacts with the database for caching and archiving.
    *   `backtest/index.ts`: Contains the backtesting engine.
    *   `strategies/`: Directory for strategy-related code.
        *   `strategy.types.ts`: Defines core strategy interfaces.
        *   `strategyManager.ts`: Manages registration and retrieval of strategies.
        *   `implementations/`: Contains actual strategy logic files (e.g., `simpleThresholdStrategy.ts`, `ichimokuStrategy.ts`).
    *   `utils/logger.ts`: Logging utility.
*   `tests/`: Unit and integration tests.
    *   `database/database.test.ts`: Tests for database logic.
    *   `services/dataService.test.ts`: Tests for data fetching, caching, and fallback.
    *   `backtest/backtest.test.ts`: Tests for the backtesting engine and its integration with the strategy manager.
    *   `strategies/strategyManager.test.ts`: Tests for the strategy registration and retrieval logic.
    *   `strategies/ichimokuStrategy.test.ts`: Unit tests for the Ichimoku Cloud strategy logic.
*   `.env.example`: Template for environment variables.
*   `trading_data.db`: SQLite database file (automatically created).
*   `backtestConfig.json`: Example JSON file for configuring and running multiple backtests.
*   `PROJECT_TRACKING.md`: Document tracking project progress and future direction.

## 5. Setup and Usage

1.  **Prerequisites**:
    *   Node.js (>= 20 recommended)
    *   npm (usually comes with Node.js)

2.  **Installation**:
    ```bash
    git clone <repository-url>
    cd <repository-name>
    npm install
    ```

3.  **Environment Variables**:
    *   Copy `.env.example` to a new file named `.env`.
    *   Open the `.env` file and fill in all required values. Refer to `.env.example` for the full list of variables.
    *   **Critical variables to set include:**
        *   `API_ENCRYPTION_KEY`: A secure 64-character hexadecimal string used for encrypting sensitive API key data stored by users. Generate a cryptographically secure random string for this.
        *   `JWT_SECRET`: A long, random, and secret string used for signing authentication tokens.
        *   API keys for external financial data providers (e.g., `ALPHA_VANTAGE_API_KEY`, `BINANCE_API_KEY`, etc.), as needed for the data sources you intend to use.
    ```
    # Example structure in your .env file (refer to .env.example for the full list):
    API_ENCRYPTION_KEY=YOUR_GENERATED_64_HEX_CHAR_ENCRYPTION_KEY
    JWT_SECRET=YOUR_SUPER_LONG_AND_RANDOM_JWT_SECRET
    ALPHA_VANTAGE_API_KEY=YOUR_ALPHA_VANTAGE_KEY
    # BINANCE_API_KEY=YOUR_BINANCE_KEY_IF_NEEDED
    # BINANCE_API_SECRET=YOUR_BINANCE_SECRET_IF_NEEDED
    ```

4.  **Running the Application (Example Usage/Development)**:
    *   The application is primarily a collection of services and a backtesting engine at this stage. You can interact with its components programmatically.
    *   To build the TypeScript code:
        ```bash
        npm run build
        ```
    *   Example: To test fetching data (ensure your `.env` is set up):
        ```typescript
        // Create a test script, e.g., test-fetch.ts in the root or scripts/
        import { fetchAlphaVantageData } from './dist/services/dataService'; // Adjust path after build

        async function main() {
          const data = await fetchAlphaVANTAGE_API_KEYata('IBM', process.env.ALPHA_VANTAGE_API_KEY || 'YOUR_KEY');
          console.log(JSON.stringify(data, null, 2));
        }
        main().catch(console.error);
        ```
        Then run: `node test-fetch.js` (after building and ensuring paths are correct).

5.  **Running Backtests via JSON Configuration**:
    *   The primary way to run backtests is by defining configurations in the `backtestConfig.json` file located in the project root.
    *   **Structure of `backtestConfig.json`**: This file should contain a JSON array, where each object represents a single backtest configuration. Each object can have the following properties:
        *   `symbol` (string, required): The trading symbol (e.g., "BTCUSDT", "AAPL").
        *   `startDate` (string, required): Start date for the backtest (YYYY-MM-DD format).
        *   `endDate` (string, required): End date for the backtest (YYYY-MM-DD format).
        *   `initialCash` (number, required): The initial amount of cash for the backtest.
        *   `strategyId` (string, required): The ID of the strategy to use (must match an ID registered in `StrategyManager`).
        *   `strategyParams` (object, required): An object containing parameters specific to the chosen strategy (e.g., `{ "upperThreshold": 150, "lowerThreshold": 140 }`).
        *   `sourceApi` (string, optional): The API source to fetch data from (e.g., "Binance", "AlphaVantage", "YahooFinance"). Defaults may apply if not provided.
        *   `interval` (string, optional): The data interval (e.g., "1d", "1h", "5min"). Defaults may apply if not provided.
    *   **Example `backtestConfig.json` Snippet**:
        ```json
        [
          {
            "symbol": "BTCUSDT",
            "startDate": "2023-01-01",
            "endDate": "2023-03-31",
            "initialCash": 10000,
            "strategyId": "ichimoku-cloud",
            "strategyParams": {
              "tenkanPeriod": 9,
              "kijunPeriod": 26,
              "tradeAmount": 0.1
            },
            "sourceApi": "Binance",
            "interval": "1d"
          }
        ]
        ```
    *   **Execution**: To run the backtests defined in this file, use the npm script:
        ```bash
        npm run backtest:json
        ```
        This will execute `src/executeBacktestFromJson.ts`, which reads the config, runs each backtest, and logs the results.

6.  **Running the Frontend Application (Development)**:
    *   The project includes a React frontend built with Vite for interactively configuring and running backtests.
    *   **Prerequisites**: Ensure Node.js and npm are installed.
    *   **Setup**:
        1.  Navigate to the frontend directory: `cd frontend`
        2.  Install dependencies: `npm install`
    *   **Running Frontend Only**:
        *   From the `frontend` directory: `npm run dev`
        *   Or, from the project root directory: `npm run frontend:dev`
        *   The frontend development server typically starts on `http://localhost:5173`.
    *   **Running Full Stack (Backend API + Frontend UI)**:
        *   From the project root directory: `npm run dev:fullstack`
        *   This command uses `concurrently` to start both the backend API server (via `npm run dev`) and the frontend development server.
        *   The application now features user registration and login. On first visit, you'll be directed to the login page. If you don't have an account, you can navigate to the registration page.
        *   The UI now also displays the currently recommended strategy by the `AI Strategy Selector` when it is selected, providing real-time insight into its choice for a given symbol before running a full backtest.
        *   The backtesting results interface has been enhanced to display annotations on the price chart when using the `AISelectorStrategy`. These annotations show the active underlying strategy chosen by the AI for different segments of the backtest period.
        *   **Note**: If you encounter issues with `concurrently` in your specific environment (e.g., "command not found" errors for `ts-node` or `concurrently` itself), you can run the backend and frontend in separate terminals:
            *   Terminal 1 (Root Directory): `npm run dev` (for backend)
            *   Terminal 2 (Root Directory): `npm run frontend:dev` (for frontend)
    *   **Building the Frontend for Production**:
        *   From the project root directory: `npm run frontend:build`
        *   Or, from the `frontend` directory: `npm run build`
        *   This creates a `dist` folder within the `frontend` directory containing optimized static assets.

7.  **Running Unit Tests**:
    ```bash
    npm test
    ```
    This will execute all tests located in the `tests/` directory, including backend API tests and frontend component tests.

## 7. Backend API Endpoints

All backend endpoints are prefixed with `/api`. The backend provides the following API endpoints to support the frontend UI and potentially other clients:

*   **`GET /api/strategies`**
    *   **Description:** Retrieves a list of all available trading strategies that can be used for backtesting.
    *   **Response Body (Success: 200 OK):** An array of `TradingStrategy` objects. Each object includes:
        *   `id` (string): Unique identifier for the strategy.
        *   `name` (string): User-friendly name of the strategy.
        *   `description` (string, optional): A brief explanation of the strategy.
        *   `parameters` (Array of `StrategyParameterDefinition`): An array describing the parameters the strategy accepts, including their `name`, `label`, `type` (`number`, `string`, `boolean`), `defaultValue`, and `description`.
    *   **Response Body (Error: 500 Internal Server Error):**
        ```json
        {
          "message": "Error fetching strategies",
          "error": "<error_details>"
        }
        ```

*   **`POST /api/backtest`**
    *   **Description:** Runs a backtest for a given strategy with specified parameters and market conditions.
    *   **Request Body (JSON):**
        ```json
        {
          "strategyId": "string", // ID of the strategy (e.g., "ichimoku-cloud")
          "strategyParams": { "paramName": "value", ... }, // Object with strategy-specific parameters
          "symbol": "string", // Trading symbol (e.g., "BTCUSDT")
          "startDate": "YYYY-MM-DD", // Start date for historical data
          "endDate": "YYYY-MM-DD",   // End date for historical data
          "initialCash": "number",   // Initial cash for the backtest
          "sourceApi": "string",     // Optional: Data source (e.g., "Binance")
          "interval": "string"       // Optional: Data interval (e.g., "1d")
        }
        ```
    *   **Response Body (Success: 200 OK):** A `BacktestResult` object containing detailed results of the backtest. This object includes fields like `finalPortfolioValue`, `totalProfitOrLoss`, `trades` array, and potentially `aiDecisionLog` if the `AISelectorStrategy` was used.
        *   **Example `BacktestResult` structure with `aiDecisionLog`**:
            ```json
            {
              "symbol": "BTCUSDT",
              "startDate": "2023-01-01T00:00:00.000Z",
              "endDate": "2023-03-31T00:00:00.000Z",
              "initialPortfolioValue": 10000,
              "finalPortfolioValue": 12500,
              "totalProfitOrLoss": 2500,
              "profitOrLossPercentage": 25,
              "trades": [ /* ... array of trade objects ... */ ],
              "totalTrades": 5,
              "dataPointsProcessed": 90,
              "historicalDataUsed": [ /* ... array of historical data points ... */ ],
              "portfolioHistory": [ /* ... array of portfolio history points ... */ ],
              "aiDecisionLog": [ // Optional: Present if AISelectorStrategy was used
                {
                  "timestamp": 1672531200, // Unix timestamp (seconds)
                  "date": "2023-01-01", // Date string
                  "chosenStrategyId": "ichimoku-cloud",
                  "chosenStrategyName": "Ichimoku Cloud Strategy",
                  "parametersUsed": { "tenkanPeriod": 9, "kijunPeriod": 26 },
                  "evaluationScore": 0.75,
                  "evaluationMetricUsed": "sharpe"
                }
                // ... more decision objects
              ]
            }
            ```
        *   `aiDecisionLog` (Array<AIDecision>, optional): A log of decisions made by the `AISelectorStrategy` during the backtest, if it was the strategy used. Each entry details the chosen underlying strategy, parameters, and evaluation metrics for a specific time point.
    *   **Response Body (Error):**
        *   **400 Bad Request:** If input validation fails (e.g., missing fields, invalid date format, `endDate` not after `startDate`). Response includes a `message` field detailing the error.
        *   **404 Not Found:** If the specified `strategyId` is not found. Response includes a `message` field.
        *   **500 Internal Server Error:** If an unexpected error occurs during backtest execution. Response includes `message` and optionally `error` fields.

*   **User Authentication Endpoints (`/api/auth`)**
    *   **`POST /api/auth/register`**
        *   **Description:** Registers a new user.
        *   **Request Body (JSON):** `{ "email": "string", "password": "string" }`
            *   `email`: User's email address.
            *   `password`: User's chosen password (min 6 characters).
        *   **Response (Success: 201 Created):** `{ "id": "string", "email": "string", "message": "User registered successfully" }` (actual user object without password hash).
        *   **Response (Error):**
            *   `400 Bad Request`: Invalid input (e.g., missing fields, invalid email, short password).
            *   `409 Conflict`: If the email already exists.
            *   `500 Internal Server Error`: Server-side error.
    *   **`POST /api/auth/login`**
        *   **Description:** Logs in an existing user.
        *   **Request Body (JSON):** `{ "email": "string", "password": "string" }`
        *   **Response (Success: 200 OK):** `{ "token": "string" }` (JWT token for authenticating subsequent requests).
        *   **Response (Error):**
            *   `401 Unauthorized`: Invalid credentials (user not found or password mismatch).
            *   `500 Internal Server Error`: Server-side error.

*   **API Key Management Endpoints (`/api/keys`)**
    *   All these endpoints require authentication using a JWT token passed in the `Authorization: Bearer <JWT_TOKEN>` header.
    *   **`POST /api/keys`**
        *   **Description:** Create a new API key for the authenticated user.
        *   **Request Body (JSON):** `{ "exchange_name": "string", "api_key": "string", "api_secret": "string" }`
            *   `exchange_name`: Name of the exchange (e.g., "Binance", "Coinbase Pro").
            *   `api_key`: The API key string.
            *   `api_secret`: The API secret string.
        *   **Response (Success: 201 Created):** The newly created API key object, including its `id`, `user_id`, `exchange_name`, `api_key` (decrypted), `api_secret` (decrypted), `created_at`, and `updated_at`.
        *   **Response (Error):**
            *   `400 Bad Request`: If input validation fails (e.g., missing fields, invalid format).
            *   `401 Unauthorized`: If the user is not authenticated.
            *   `500 Internal Server Error`: If there's an issue creating the key.
    *   **`GET /api/keys`**
        *   **Description:** Get all API keys for the authenticated user.
        *   **Response (Success: 200 OK):** An array of API key objects belonging to the user. API keys and secrets are decrypted.
        *   **Response (Error):**
            *   `401 Unauthorized`: If the user is not authenticated.
            *   `500 Internal Server Error`: If there's an issue fetching the keys.
    *   **`PUT /api/keys/:id`**
        *   **Description:** Update an existing API key by its ID. Only the fields provided in the request body will be updated.
        *   **Request Body (JSON):** `{ "exchange_name": "string", "api_key": "string", "api_secret": "string" }` (all fields optional)
        *   **Response (Success: 200 OK):** The updated API key object (with decrypted key/secret).
        *   **Response (Error):**
            *   `400 Bad Request`: If input validation fails.
            *   `401 Unauthorized`: If the user is not authenticated.
            *   `404 Not Found`: If the API key with the given ID is not found or does not belong to the user.
            *   `500 Internal Server Error`: If there's an issue updating the key.
    *   **`DELETE /api/keys/:id`**
        *   **Description:** Delete an API key by its ID.
        *   **Response (Success: 204 No Content):** No content is returned on successful deletion.
        *   **Response (Error):**
            *   `401 Unauthorized`: If the user is not authenticated.
            *   `404 Not Found`: If the API key with the given ID is not found or does not belong to the user.
            *   `500 Internal Server Error`: If there's an issue deleting the key.

*   **AI Endpoints**
    *   **`GET /api/ai/current-strategy/:symbol`**
        *   **Description**: Retrieves the trading strategy currently selected by the AI Strategy Selector for the given trading symbol, based on its last evaluation. This includes the parameters (optimized or default) that the AI has chosen for the strategy.
        *   **URL Parameters**:
            *   `symbol` (string): The trading symbol (e.g., "BTCUSDT").
        *   **Response Body (Success: 200 OK)**:
            ```json
            {
              "symbol": "BTCUSDT",
              "chosenStrategyId": "ichimoku-cloud",
              "chosenStrategyName": "Ichimoku Cloud Strategy",
              "chosenParameters": { "tenkanPeriod": 10, "kijunPeriod": 25 },
              "message": "AI is currently using Ichimoku Cloud Strategy for BTCUSDT with specified parameters."
            }
            ```
            *   `chosenParameters` (object | null): An object containing the parameters (either optimized or default) that will be used for the `chosenStrategyId`. Will be `null` or empty if no specific parameters were determined beyond defaults or if no strategy was chosen.
        *   **Response Body (Error: 404 Not Found)**: If no choice is currently available for the symbol.
            ```json
            {
              "symbol": "string",
              "message": "string",
              "chosenStrategyId": null,
              "chosenStrategyName": null,
              "chosenParameters": null
            }
            ```
            (Example: `{"symbol": "XYZUSDT", "message": "AI choice not available for symbol XYZUSDT.", "chosenStrategyId": null, "chosenStrategyName": null, "chosenParameters": null}`)
        *   **Response Body (Error: 500 Internal Server Error)**: For other server-side issues during retrieval.

## 8. Available Trading Strategies

The following strategies are currently implemented and can be used in `backtestConfig.json`:

*   **Simple Threshold Strategy (`simple-threshold`)**:
    *   **Description**: A basic strategy that buys when the price exceeds an upper threshold and sells when it falls below a lower threshold.
    *   **Parameters**:
        *   `upperThreshold` (number): Price level above which to generate a BUY signal. (Default: 150)
        *   `lowerThreshold` (number): Price level below which to generate a SELL signal. (Default: 140)
        *   `tradeAmount` (number): Number of shares/units to trade per signal. (Default: 1)

*   **Ichimoku Cloud Strategy (`ichimoku-cloud`)**:
    *   **Description**: A comprehensive trend-following indicator that uses multiple lines and a "cloud" (Kumo) to define support/resistance levels and generate trading signals. It considers Tenkan-sen/Kijun-sen crosses, price position relative to the Kumo, Chikou Span confirmation, and future Kumo direction.
    *   **Parameters**:
        *   `tenkanPeriod` (number): Lookback period for Tenkan-sen (Conversion Line). (Default: 9)
        *   `kijunPeriod` (number): Lookback period for Kijun-sen (Base Line). (Default: 26)
        *   `senkouSpanBPeriod` (number): Lookback period for Senkou Span B (the slowest component of the Kumo). (Default: 52)
        *   `chikouLaggingPeriod` (number): The number of periods the Chikou Span (Lagging Span) is displaced backward. (Default: 26)
        *   `senkouCloudDisplacement` (number): The number of periods the Senkou Spans (Kumo cloud) are displaced forward. (Default: 26)
        *   `tradeAmount` (number): Number of shares/units to trade per signal. (Default: 1)

*   **RSI + Bollinger Bands Strategy (`rsi-bollinger`)**:
    *   **Description**: Generates BUY signals when RSI is oversold and price is at/below lower Bollinger Band. Generates SELL signals when RSI is overbought and price is at/above upper Bollinger Band.
    *   **Parameters**:
        *   `rsiPeriod` (number): Lookback period for RSI. (Default: 14)
        *   `rsiOverbought` (number): RSI level above which to consider overbought. (Default: 70)
        *   `rsiOversold` (number): RSI level below which to consider oversold. (Default: 30)
        *   `bollingerPeriod` (number): Lookback period for Bollinger Bands. (Default: 20)
        *   `bollingerStdDev` (number): Number of standard deviations for upper/lower Bollinger Bands. (Default: 2)
        *   `tradeAmount` (number): Number of shares/units to trade per signal. (Default: 1)

*   **MACD Crossover Strategy (`macd-crossover`)**:
    *   **Description**: Generates BUY signals when the MACD line crosses above the Signal line, and SELL signals when it crosses below.
    *   **Parameters**:
        *   `shortPeriod` (number): Lookback period for the shorter EMA in MACD calculation. (Default: 12)
        *   `longPeriod` (number): Lookback period for the longer EMA in MACD calculation. (Default: 26)
        *   `signalPeriod` (number): Lookback period for the EMA of the MACD line (Signal line). (Default: 9)
        *   `tradeAmount` (number): Number of shares/units to trade per signal. (Default: 1)

*   **AI Price Prediction Strategy (`ai-price-prediction`) (Experimental)**:
    *   **Name**: AI Price Prediction Strategy (Experimental)
    *   **ID**: `ai-price-prediction`
    *   **Description**: Uses a simple neural network (LSTM-based) to predict future price movements. The model trains once at the beginning of each backtest run on a specified portion of the historical data. Due to the nature of in-app training, performance and stability may vary. Use with caution and consider computational cost for large datasets/epochs.
    *   **Parameters**:
        *   `lookbackPeriod` (number): Number of past data points for prediction input. (Default: 10)
        *   `predictionHorizon` (number): How many periods ahead to predict the target. (Default: 1)
        *   `trainingDataSplit` (number): Percentage of historical data used for training (0.1 to 0.9). (Default: 0.7)
        *   `epochs` (number): Number of training iterations over the training data. (Default: 10)
        *   `learningRate` (number): Step size for optimizer during training. (Default: 0.01)
        *   `lstmUnits` (number): Number of units in the LSTM layer. (Default: 32)
        *   `denseUnits` (number): Number of units in the Dense layer after LSTM (0 for none). (Default: 16)
        *   `buyThreshold` (number): Prediction score above which a BUY signal is considered (0.5 to 1.0). (Default: 0.6)
        *   `sellThreshold` (number): Prediction score below which a SELL signal is considered (0.0 to 0.5). (Default: 0.4)
        *   `tradeAmount` (number): Number of shares/units to trade per signal. (Default: 1)

*   **AI Strategy Selector (`ai-selector`)**:
    *   **Name**: AI Strategy Selector
    *   **ID**: `ai-selector`
    *   **Description**: A meta-strategy that dynamically selects and executes an underlying trading strategy. Its choice is based on a short-term performance simulation of candidate strategies using recent market data and a configurable evaluation metric. It can optionally optimize parameters for candidate strategies. It selects from other available, non-meta strategies.
    *   **Parameters**:
        *   `evaluationLookbackPeriod` (number): Number of recent data points used to evaluate candidate strategies. (Default: 30)
        *   `candidateStrategyIds` (string): Optional comma-separated list of strategy IDs to consider (e.g., "ichimoku-cloud,macd-crossover"). If empty, all available concrete (non-meta) strategies are considered. (Default: "")
        *   `evaluationMetric` (string): Specifies the metric used by the AI to evaluate and select the best underlying strategy. Default: `"pnl"`.
            *   `"pnl"`: Selects the strategy with the highest simulated Profit/Loss over the lookback period.
            *   `"sharpe"`: Selects the strategy with the best simplified Sharpe Ratio (average per-candle return divided by standard deviation of per-candle returns) over the lookback period.
            *   `"winRate"`: Selects the strategy with the highest Win Rate (percentage of profitable simulated trades) over the lookback period.
        *   `optimizeParameters` (boolean): If set to `true`, the AI Strategy Selector will attempt to optimize the parameters of its candidate strategies using a Grid Search algorithm. This significantly increases evaluation time but can lead to better strategy performance. Default: `false`.
            *   **Note on Optimization**: When `optimizeParameters` is true, the AI evaluates strategies by searching for the best parameter combinations within predefined ranges (`min`, `max`, `step` which must be set in the individual strategy definitions for numerical parameters).
            *   **Performance Warning**: Enabling `optimizeParameters` can be computationally intensive and may significantly slow down backtests or decision-making processes, especially with many candidate strategies, multiple optimizable parameters per strategy, or wide parameter ranges with small steps.
    *   **Defining Optimizable Strategy Parameters**: For a strategy's parameters to be optimizable by the `AISelectorStrategy`, its numerical parameter definitions within its implementation file (e.g., `src/strategies/implementations/ichimokuStrategy.ts`) must include `min`, `max`, and `step` attributes to define the search space for the Grid Search.
    *   **Visualization**: When backtesting with `AISelectorStrategy`, the sequence of strategies it chooses (and any optimized parameters) is logged and displayed as annotations on the price chart in the backtest results, providing insight into its decision-making process.

## 9. Adding a New Strategy

To add a new custom trading strategy:

1.  **Create Strategy File**:
    *   Create a new TypeScript file in the `src/strategies/implementations/` directory (e.g., `myAwesomeStrategy.ts`).
2.  **Implement `TradingStrategy` Interface**:
    *   Import `TradingStrategy`, `StrategyContext`, `StrategySignal`, and `StrategyParameterDefinition` from `../strategy.types`.
    *   Define your strategy object, ensuring it conforms to the `TradingStrategy` interface.
    *   **Metadata**: Provide `id` (unique string), `name` (user-friendly), and optionally `description`.
    *   **Parameters (`StrategyParameterDefinition[]`)**: Define all configurable parameters your strategy will use. For each parameter, specify its `name`, `label`, `type` ('number', 'string', 'boolean'), `defaultValue`, and optionally `description`, `min`, `max`, `step`.
    *   **`execute` Method**: Implement the core logic: `execute: (context: StrategyContext): StrategySignal => { ... }`.
        *   Access historical data via `context.historicalData` and the current point via `context.currentIndex`.
        *   Use `context.parameters` to get the configured values for your strategy.
        *   Return a `StrategySignal` object: `{ action: 'BUY' | 'SELL' | 'HOLD', amount?: number }`.
3.  **Register the Strategy**:
    *   Open `src/strategies/strategyManager.ts`.
    *   Import your new strategy object (e.g., `import { myAwesomeStrategy } from './implementations/myAwesomeStrategy';`).
    *   In the auto-registration section at the bottom of the file, add a call to `registerStrategy(myAwesomeStrategy);`.
4.  **Update Exports (Optional but Good Practice)**:
    *   Open `src/strategies/index.ts` and export your new strategy implementation: `export * from './implementations/myAwesomeStrategy';`. This makes it available for direct import if ever needed, though the `StrategyManager` is the primary way to access it.
5.  **Add Unit Tests**:
    *   Create a corresponding test file in `tests/strategies/` (e.g., `myAwesomeStrategy.test.ts`).
    *   Write tests for your strategy's `execute` method, covering different scenarios (buy, sell, hold, edge cases, parameter variations).

Once registered, your new strategy can be used in `backtestConfig.json` by referencing its `id`.

## 10. Deployment Considerations

### General Node.js Deployment:
*   **Server Setup:** Ensure Node.js and npm are installed on the target server.
*   **Code Deployment:** Clone the repository.
*   **Dependencies:** Install production dependencies: `npm ci` or `npm install --production`.
*   **Build:** Compile TypeScript: `npm run build`.
*   **Environment Variables:** Set up environment variables (API keys, etc.) securely on the server.
*   **Process Management:** Use a process manager like PM2 to run the application (e.g., `pm2 start dist/index.js` if you have a main entry point, or for specific services/tasks).

### SQLite Database (`trading_data.db`):
*   **Persistence:** The `trading_data.db` file will be created in the application's working directory (project root by default). Ensure this location is persistent across deployments and has necessary write permissions.
*   **Stateless Environments:** For stateless deployment models (e.g., some container orchestrators, serverless functions), a file-based SQLite database requires a persistent volume to be mounted. Without this, data will be lost when the instance/container restarts.
*   **Scalability:** For applications requiring high concurrency or distributed access, consider migrating to a client-server database (e.g., PostgreSQL, MySQL) or a managed cloud database service. This is beyond the current project's scope but important for future scaling.

### AWS Deployment Notes (General):
*   **EC2 Instance:**
    *   Deploy as a standard Node.js application. Install Node.js, clone the repo, build, and run using PM2.
    *   The SQLite database file would reside on the EC2 instance's EBS volume, which is persistent.
    *   Configure Security Groups to allow necessary inbound/outbound traffic (e.g., HTTPS for API calls).
*   **Docker:**
    *   Containerize the application using a `Dockerfile`. The image should include Node.js, application code, and dependencies.
    *   To persist `trading_data.db`, map a Docker volume to the path where the database file is stored. This keeps the data separate from the container lifecycle.
*   **Elastic Beanstalk:**
    *   Simplifies deployment. Zip your application (including `package.json`, compiled code in `dist/`, and potentially `.npmrc`, `.ebextensions` for custom setup) and upload it.
    *   SQLite persistence needs careful consideration; you might need to configure an EBS volume or consider alternatives if high availability or scaling is needed.
*   **Serverless (Lambda/API Gateway):**
    *   Using a file-based SQLite with AWS Lambda is challenging due to its stateless nature and ephemeral filesystem.
    *   For persistence, AWS EFS (Elastic File System) can be integrated with Lambda, but this adds complexity and cost.
    *   For significant database usage in a serverless architecture, a managed database like AWS RDS (for relational data) or DynamoDB (NoSQL) is generally preferred over file-based SQLite. This is an advanced consideration if the application evolves towards a serverless model.
*   **API Keys & Credentials:**
    *   **Never hardcode credentials.**
    *   Use AWS Secrets Manager for storing API keys and other secrets securely.
    *   Alternatively, provide them as environment variables during the deployment process (e.g., through EC2 user data, Elastic Beanstalk environment properties, Lambda environment variables).

## 11. Future Development

For a detailed list of potential future enhancements and the project roadmap, please refer to `PROJECT_TRACKING.md`. This includes ideas like:

*   Implementing more sophisticated trading strategies.
*   Adding more data sources and ensuring robust handling for different data formats.
*   **UI Enhancements:**
    *   Developing advanced data visualization for backtest results (e.g., equity curves, trade markers on charts) within the React UI.
    *   Improving the web UI for strategy selection, parameter configuration, and backtest initiation/monitoring (e.g., saving configurations, comparing results).
*   Storing strategy configurations and backtest results in the database.
*   Enhancing configuration options (e.g., risk management parameters per strategy).

---

*Initial project objectives related to specific algorithms (Moving Averages, RSI, Markowitz, Kelly Criterion, etc.), paper trading, and a real-time dashboard are part of the broader vision and will be tracked in `PROJECT_TRACKING.md`.*
