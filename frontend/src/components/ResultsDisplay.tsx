// frontend/src/components/ResultsDisplay.tsx
import React from 'react';
import type { BacktestResult, Trade } from '../types'; // Assuming types.ts is in ../
import { logger } from '../utils/logger';

interface ResultsDisplayProps {
  results: BacktestResult | null;
  error: string | null;
  loading: boolean;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ results, error, loading }) => {
  if (loading) {
    return <p className="loading-message">Running backtest...</p>;
  }

  if (error) {
    return <p className="error-message">Error running backtest: {error}</p>;
  }

  if (!results) {
    return <p className="info-message">Run a backtest to see results.</p>; // Added class for consistency
  }

  // Helper to format numbers to 2 decimal places
  const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return 'N/A';
    return num.toFixed(2);
  };
  
  // Helper to format date string (assuming results.startDate/endDate are YYYY-MM-DD or ISO strings)
  const formatDate = (dateStr: string | undefined | null): string => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch (e) {
      logger.warn(`Could not format date: ${dateStr}`, e);
      return dateStr; // return original if formatting fails
    }
  };


  return (
    <div className="results-display backtest-section"> {/* Use backtest-section for consistent box styling */}
      <h3>Backtest Results</h3>
      <div className="results-summary">
        <p><strong>Symbol:</strong> {results.symbol}</p>
        <p><strong>Period:</strong> {formatDate(results.startDate)} - {formatDate(results.endDate)}</p>
        <p><strong>Initial Portfolio Value:</strong> ${formatNumber(results.initialPortfolioValue)}</p>
        <p><strong>Final Portfolio Value:</strong> ${formatNumber(results.finalPortfolioValue)}</p>
        <p><strong>Total Profit/Loss:</strong> <span className={results.totalProfitOrLoss >= 0 ? 'profit' : 'loss'}>${formatNumber(results.totalProfitOrLoss)}</span></p>
        <p><strong>Profit/Loss Percentage:</strong> <span className={results.profitOrLossPercentage >= 0 ? 'profit' : 'loss'}>{formatNumber(results.profitOrLossPercentage)}%</span></p>
        <p><strong>Total Trades:</strong> {results.totalTrades}</p>
        <p><strong>Data Points Processed:</strong> {results.dataPointsProcessed}</p>
      </div>

      {results.trades && results.trades.length > 0 && (
        <div className="trades-table-container">
          <h4>Trades:</h4>
          <table> {/* Will be styled by global styles in index.css */}
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Price</th>
                <th>Shares</th>
                <th>Cash After Trade</th>
              </tr>
            </thead>
            <tbody>
              {results.trades.map((trade: Trade, index: number) => (
                <tr key={index}>
                  <td>{formatDate(trade.date)}</td>
                  <td>{trade.action}</td>
                  <td>${formatNumber(trade.price)}</td>
                  <td>{formatNumber(trade.sharesTraded)}</td>
                  <td>${formatNumber(trade.cashAfterTrade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ResultsDisplay;
