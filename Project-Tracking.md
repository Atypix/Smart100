# Project Tracking: Smart100 Algorithmic Trading App

This document tracks the major development phases, features, and future roadmap for the Smart100 application.

## Phase 1: Application Structure & Basic Suggestion Page Flow (Completed)

**Date Completed:** YYYY-MM-DD (Current Date)

**Key Accomplishments:**

*   **New Application Structure & Navigation:**
    - Implemented a client-side routing system using `react-router-dom`.
    - Introduced a horizontal navigation bar (`Navbar.tsx`) with three main sections:
        - **Suggestion:** A new page for an interactive strategy suggestion experience.
        - **Backtest:** The existing backtesting functionality, now a dedicated page.
        - **Clés API:** A new page for managing user API keys, integrating the existing `ApiKeyManager.tsx` component.

*   **Suggestion Page (`SuggestionPage.tsx`) - Core Flow:**
    - **Step 1: User Input Form:**
        - Allows users to input "Capital Initial" and "Pourcentage du capital par transaction."
        - A "Lancer la suggestion" button triggers the process.
    - **Step 2: Display Suggestions:**
        - Fetches and displays up to 3 diverse strategy suggestions from the backend.
        - Each suggestion card shows:
            - Placeholder thematic name (e.g., "Suggestion Option 1").
            - Strategy Name and ID.
            - Symbol for the suggestion.
            - Available performance metrics (e.g., P&L score from AI evaluation).
            - Calculated max risk per trade based on user input.
            - A button to "Choisir et Backtester cette suggestion."
    - **Step 3: Display Basic Backtest Result:**
        - When a suggestion is chosen, a backtest is automatically run using default parameters (90-day period, Binance 1d data).
        - Key Performance Indicators (KPIs) like Final Portfolio Value, Total P&L, Sharpe Ratio (if available), Max Drawdown (if available), and Total Trades are displayed textually.
        - Navigation options to return to the suggestions list or the initial form are provided.

*   **Backend API Adjustments:**
    - The `/api/ai/suggest-strategy` endpoint was enhanced to return a list of up to 3 suggestions.
    - Diagnostic logging was added to the backend to help troubleshoot scenarios with empty suggestion results.

*   **Styling:**
    - Basic CSS was added for the new navigation elements and page layouts for initial usability.

**Next Steps (Phase 2):** Focus on UI/UX refinements for the Suggestion Page, including thematic suggestion names, improved metrics display, animations, and integrating detailed charts for backtest results.

---

## Phase 2: UI/UX Refinements for Suggestion Page (Planned)

*   **Suggestion Display:**
    - Implement thematic names for suggestions (e.g., “Écureuil prudent”, “Hérisson équilibré”, “Faucon audacieux”).
    - Display more meaningful "Type de stratégie" (e.g., map "ichimoku-cloud" to "Ichimoku").
    - Refine display of ROI and other metrics (requires backend to possibly provide more direct ROI estimates or simulated trade counts).
*   **Animations & Transitions:**
    - Input field animations.
    - Loading animation for suggestion fetching.
    - "Confettis" or "card morphing" animation before displaying suggestions.
    - Suggestions appear with "glissement depuis la droite".
    - Hover scale effect on suggestion cards.
    - Animated icons (SVG/emojis) for suggestions.
    - Fluid "fade in + slide" for backtest result display.
    - Pulsing/popping "Simulation terminée" badge.
*   **Backtest Result Display:**
    - Integrate `EquityChart` and `TradesOnPriceChart` components (or similar) into the Suggestion Page's result view.
    - Clearly display KPIs: CAGR, Drawdown max, Ratio de Sharpe, % de trades gagnants.
*   **Styling:**
    - Implement a clear/pastel theme (or dark mode).
    - Use modern typography (Inter, Poppins).

## Phase 3: Advanced Features & Polish (Planned)

*   Advanced micro-interactions and animations.
*   Tooltips with pedagogical explanations for suggestions.
*   Option “Envoyer la stratégie par email” (requires SendGrid backend setup).
*   Subtle sound effects (optional/toggleable).

---
*(Previous project status and details from README.md can be appended here or kept separate if README is the primary source for older history)*
