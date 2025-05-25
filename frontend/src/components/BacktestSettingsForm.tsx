// frontend/src/components/BacktestSettingsForm.tsx
import React, { useState, useEffect } from 'react';
import { BacktestSettings } from '../types';
import { logger } from '../utils/logger';

interface BacktestSettingsFormProps {
  onSettingsChange: (settings: BacktestSettings) => void;
  initialSettings: BacktestSettings; // Allow parent to provide initial/default settings
}

const BacktestSettingsForm: React.FC<BacktestSettingsFormProps> = ({ onSettingsChange, initialSettings }) => {
  const [settings, setSettings] = useState<BacktestSettings>(initialSettings);

  // Update local state if initialSettings prop changes (e.g., parent resets form)
  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = event.target;
    let processedValue: any = value;

    if (type === 'number') {
      processedValue = parseFloat(value);
      if (isNaN(processedValue)) processedValue = 0; // Default to 0 or handle as per requirements
    }
    // Dates are handled as strings (YYYY-MM-DD) by HTML date input

    const updatedSettings = {
      ...settings,
      [name]: processedValue,
    };
    setSettings(updatedSettings);
    onSettingsChange(updatedSettings); // Notify parent of every change
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
          <label htmlFor="symbol">Symbol:</label>
          <input
            type="text"
            id="symbol"
            name="symbol"
            value={settings.symbol}
            onChange={handleChange}
            placeholder="e.g., BTCUSDT, AAPL"
            required
          />
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
          <input
            type="text"
            id="sourceApi"
            name="sourceApi"
            value={settings.sourceApi || ''}
            onChange={handleChange}
            placeholder="e.g., Binance, YahooFinance"
          />
        </div>
        <div className="form-group">
          <label htmlFor="interval">Interval (Optional):</label>
          <input
            type="text"
            id="interval"
            name="interval"
            value={settings.interval || ''}
            onChange={handleChange}
            placeholder="e.g., 1d, 1h, 5min"
          />
        </div>
      </div>
    </div>
  );
};

export default BacktestSettingsForm;
