// frontend/src/components/StrategySelector.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import type { TradingStrategy } from '../types'; // Assuming types.ts is in ../
// ApiError might be unused, will be removed if TS6133 persists for it.
import { logger } from '../utils/logger'; // Assuming a simple logger utility

interface StrategySelectorProps {
  onStrategySelect: (strategy: TradingStrategy | null) => void;
}

const StrategySelector: React.FC<StrategySelectorProps> = ({ onStrategySelect }) => {
  const [strategies, setStrategies] = useState<TradingStrategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        setLoading(true);
        setError(null);
        logger.info('Fetching available strategies...');
        const response = await axios.get<TradingStrategy[]>('/api/strategies');
        setStrategies(response.data);
        logger.debug('Fetched strategies data:', response.data); // Added detailed log
        logger.info(`Fetched ${response.data.length} strategies.`);
      } catch (err) {
        logger.error('Error fetching strategies:', err);
        logger.debug('Full error object:', err); // Added detailed log
        const errorMessage = (err as any).response?.data?.message || (err as Error).message || 'Failed to fetch strategies.';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchStrategies();
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const strategyId = event.target.value;
    setSelectedStrategyId(strategyId);
    const selectedStrategyObject = strategies.find(s => s.id === strategyId) || null;
    onStrategySelect(selectedStrategyObject);
    logger.debug(`Strategy selected: ${selectedStrategyObject?.name || 'None'}`);
  };

  if (loading) {
    logger.debug('StrategySelector: Rendering loading state'); // Added render log
    return <p className="loading-message">Loading strategies...</p>;
  }

  if (error) {
    logger.debug(`StrategySelector: Rendering error state: ${error}`); // Added render log
    return <p className="error-message">Error: {error}</p>;
  }

  if (!loading && !error && strategies.length === 0) {
    logger.debug('StrategySelector: Rendering no strategies available message');
    return <p className="info-message">No trading strategies are currently available. Please check back later or contact support if this issue persists.</p>;
  }

  logger.debug(`StrategySelector: Rendering select dropdown with ${strategies.length} strategies`); // Added render log
  return (
    <div className="form-group">
      <label htmlFor="strategy-selector">Select Strategy:</label>
      <select id="strategy-selector" value={selectedStrategyId} onChange={handleChange}>
        <option value="">-- Select a strategy --</option>
        {strategies.map(strategy => (
          <option key={strategy.id} value={strategy.id} title={strategy.description}>
            {strategy.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default StrategySelector;
