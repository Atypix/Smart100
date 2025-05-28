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
        logger.info(`Fetched ${response.data.length} strategies.`);
      } catch (err) {
        logger.error('Error fetching strategies:', err);
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
    return <p className="loading-message">Loading strategies...</p>;
  }

  if (error) {
    return <p className="error-message">Error: {error}</p>;
  }

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
