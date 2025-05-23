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

## 3. Next Steps

With the project foundation in place, the immediate next steps will involve:

*   **Data Collection Services**: Implementing modules to fetch financial data from external APIs (starting with Alpha Vantage).
    - Basic function to fetch `TIME_SERIES_INTRADAY` data from Alpha Vantage has been implemented in `src/services/dataService.ts`.
    - Added logging and unit tests for this service.
    - The service is exported via `src/services/index.ts`.
*   **Algorithm Implementation**: Developing the core trading strategies (Moving Average Crossover, RSI, etc.).
*   **Backtesting Engine**: Building the functionality to test strategies against historical data.

Further development will proceed according to the features outlined in the initial project objective.
