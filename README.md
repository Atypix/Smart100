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
*   **Backtesting Engine (`src/backtest/index.ts`)**:
    *   Provides a `runBacktest` function to test trading strategies against historical data.
    *   Strategies (e.g., `simpleThresholdStrategy`) are defined as functions that receive market data and portfolio status, then decide on actions (BUY, SELL, HOLD).
    *   Historical data for backtesting is fetched exclusively from the local SQLite database via `fetchHistoricalDataFromDB` in `dataService.ts`, ensuring consistent and fast backtests.
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
    *   `backtest/index.ts`: Contains the backtesting engine, strategy definitions, and related interfaces.
    *   `utils/logger.ts`: Logging utility.
    *   `utils/math.ts`: Sample utility (can be expanded).
*   `tests/`: Unit and integration tests.
    *   `database/database.test.ts`: Tests for database logic.
    *   `services/dataService.test.ts`: Tests for data fetching, caching, and fallback.
    *   `backtest/backtest.test.ts`: Tests for the backtesting engine.
*   `.env.example`: Template for environment variables (Alpha Vantage and Yahoo Finance API keys).
*   `trading_data.db`: SQLite database file (automatically created).
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
    *   Fill in your API keys for Alpha Vantage (and any other services you intend to use, though currently only Alpha Vantage requires one for basic operation of `fetchAlphaVantageData`).
    ```
    ALPHA_VANTAGE_API_KEY=YOUR_ALPHA_VANTAGE_KEY
    # YAHOO_FINANCE_API_KEY=YOUR_YAHOO_FINANCE_KEY (Note: Yahoo Finance via yahoo-finance2 library does not typically require an API key)
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
          const data = await fetchAlphaVantageData('IBM', process.env.ALPHA_VANTAGE_API_KEY || 'YOUR_KEY');
          console.log(JSON.stringify(data, null, 2));
        }
        main().catch(console.error);
        ```
        Then run: `node test-fetch.js` (after building and ensuring paths are correct).

5.  **Running Tests**:
    ```bash
    npm test
    ```
    This will execute all tests located in the `tests/` directory.

## 6. Deployment Considerations

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

## 7. Future Development

For a detailed list of potential future enhancements and the project roadmap, please refer to `PROJECT_TRACKING.md`. This includes ideas like:

*   Implementing more sophisticated trading strategies.
    *   Adding more data sources.
*   Developing data visualization and a user interface.
*   Enhancing configuration and deployment options.

---

*Initial project objectives related to specific algorithms (Moving Averages, RSI, Markowitz, Kelly Criterion, etc.), paper trading, and a real-time dashboard are part of the broader vision and will be tracked in `PROJECT_TRACKING.md`.*
