// frontend/src/components/BacktestSettingsForm.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios'; // Import axios
import type { BacktestSettings } from '../types';
import { logger } from '../utils/logger';

interface BacktestSettingsFormProps {
  onSettingsChange: (settings: BacktestSettings) => void;
  initialSettings: BacktestSettings; // Allow parent to provide initial/default settings
}

const BacktestSettingsForm: React.FC<BacktestSettingsFormProps> = ({ onSettingsChange, initialSettings }) => {
  const [settings, setSettings] = useState<BacktestSettings>(initialSettings);
  const [symbolsList, setSymbolsList] = useState<string[]>([]);
  const [isSymbolsLoading, setIsSymbolsLoading] = useState<boolean>(true);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);

  // Update local state if initialSettings prop changes
  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  // Fetch symbols when component mounts
  useEffect(() => {
    const fetchSymbols = async () => {
      setIsSymbolsLoading(true);
      setSymbolsError(null);
      try {
        logger.info('Fetching available symbols for BacktestSettingsForm...');
        const response = await axios.get<string[]>('/api/data/binance-symbols');
        const fetchedSymbols = response.data;
        logger.info(`Fetched ${fetchedSymbols.length} symbols.`);
        setSymbolsList(fetchedSymbols);

        if (fetchedSymbols.length > 0) {
          // Check if current symbol is valid or needs to be defaulted
          const currentSymbolIsValid = settings.symbol && fetchedSymbols.includes(settings.symbol);
          if (!currentSymbolIsValid) {
            logger.info(`Current symbol '${settings.symbol}' is invalid or empty. Defaulting to first symbol: ${fetchedSymbols[0]}`);
            const updatedSettingsWithDefaultSymbol = {
              ...settings,
              symbol: fetchedSymbols[0],
            };
            setSettings(updatedSettingsWithDefaultSymbol);
            onSettingsChange(updatedSettingsWithDefaultSymbol); // Notify parent
          }
        } else {
           logger.warn('No symbols fetched from the API.');
           // If current symbol was set, but list is empty, it becomes invalid.
           // Consider clearing it or leaving as is, based on desired UX.
           // For now, if list is empty, we can't set a default.
        }

      } catch (err) {
        logger.error('Error fetching symbols for BacktestSettingsForm:', err);
        const errorMessage = (err as any).response?.data?.message || (err as Error).message || 'Failed to fetch symbols.';
        setSymbolsError(errorMessage);
      } finally {
        setIsSymbolsLoading(false);
      }
    };

    fetchSymbols();
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, []); // Run once on mount. Settings dependency removed to avoid re-fetching on every settings change. Defaulting logic handles symbol update.

  const intervalOptions = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'];
  const dataSourceOptions = ['Binance', 'YahooFinance', 'AlphaVantage'];

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { // Extended to HTMLSelectElement
    const { name, value } = event.target;
    let processedValue: any = value;

    // Check if the event target is an HTMLInputElement for type property
    if (event.target instanceof HTMLInputElement && event.target.type === 'number') {
      processedValue = parseFloat(value);
      if (isNaN(processedValue)) processedValue = 0;
    }

    const updatedSettings = {
      ...settings,
      [name]: processedValue,
    };
    setSettings(updatedSettings);
    onSettingsChange(updatedSettings);
    logger.debug(`BacktestSettingsForm: Setting ${name} changed to`, processedValue);
  };
  
  // Helper to format date for input type="date" (YYYY-MM-DD)
  // Note: HTML date input expects YYYY-MM-DD. If initialSettings.startDate/endDate are Date objects, they need formatting.
  // For this implementation, BacktestSettings type defines them as strings already.
  const formatDateForInput = (dateString: string): string => {
    if (!dateString) return '';
    try {
      // Check if it's already in YYYY-MM-DD. If it's a full ISO string, slice it.
      if (dateString.includes('T')) {
        return dateString.split('T')[0];
      }
      // If it's potentially a Date object passed as string, try parsing and reformatting (more robust)
      // const dateObj = new Date(dateString);
      // if (!isNaN(dateObj.getTime())) {
      //   return dateObj.toISOString().split('T')[0];
      // }
      return dateString; // Assume it's in correct format or let input handle it
    } catch (e) {
      logger.warn(`Could not parse date string for input: ${dateString}`, e);
      return dateString; // fallback
    }
  };


  return (
    <div className="backtest-settings-form"> {/* main container class */}
      <h4>Global Backtest Settings</h4>
      <div className="form-grid"> {/* Use form-grid for responsive layout */}
        <div className="form-group">
          <label htmlFor="symbol-select">Symbol:</label>
          <select
            id="symbol-select"
            name="symbol"
            value={settings.symbol}
            onChange={handleChange}
            required
            disabled={isSymbolsLoading || !!symbolsError || symbolsList.length === 0}
          >
            {isSymbolsLoading && <option value="">Loading symbols...</option>}
            {symbolsError && <option value="">Error loading symbols</option>}
            {!isSymbolsLoading && !symbolsError && symbolsList.length === 0 && <option value="">No symbols available</option>}
            {!isSymbolsLoading && !symbolsError && symbolsList.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {symbolsError && <p className="error-message" style={{fontSize: '0.8em', marginTop: '0.25rem'}}>{symbolsError}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="startDate">Start Date:</label>
          <input
            type="date"
            id="startDate"
            name="startDate"
            value={formatDateForInput(settings.startDate)}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="endDate">End Date:</label>
          <input
            type="date"
            id="endDate"
            name="endDate"
            value={formatDateForInput(settings.endDate)}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="initialCash">Initial Cash:</label>
          <input
            type="number"
            id="initialCash"
            name="initialCash"
            value={settings.initialCash}
            onChange={handleChange}
            min="1"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="sourceApi">Source API (Optional):</label>
          <select
            id="sourceApi"
            name="sourceApi"
            value={settings.sourceApi || ''} // Default to Binance or handle empty
            onChange={handleChange}
          >
            {/* <option value="">-- Select Source --</option> */} {/* Retaining this commented as per plan to default to existing value */}
            {dataSourceOptions.map(source => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="interval-select">Interval (Optional):</label>
          <select
            id="interval-select"
            name="interval"
            value={settings.interval || ''}
            onChange={handleChange}
          >
            <option value="">-- Select an interval --</option> {/* Optional: for explicit unselection */}
            {intervalOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default BacktestSettingsForm;
