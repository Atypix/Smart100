// frontend/src/components/StrategyParameterForm.tsx
import React, { useEffect, useState } from 'react';
import { TradingStrategy, StrategyParameterDefinition } from '../types';
import { logger } from '../utils/logger';

interface StrategyParameterFormProps {
  strategy: TradingStrategy | null;
  onParamsChange: (params: Record<string, any>) => void;
  initialParams: Record<string, any>;
}

const StrategyParameterForm: React.FC<StrategyParameterFormProps> = ({ strategy, onParamsChange, initialParams }) => {
  const [formParams, setFormParams] = useState<Record<string, any>>({});

  // Effect to initialize or update formParams when strategy or initialParams change
  useEffect(() => {
    if (strategy) {
      // Initialize with default values from strategy parameters if no initialParams are provided for them
      const newParams: Record<string, any> = {};
      strategy.parameters.forEach(param => {
        // Prioritize initialParams, then strategy default, then fallback based on type
        if (initialParams && initialParams[param.name] !== undefined) {
          newParams[param.name] = initialParams[param.name];
        } else {
          newParams[param.name] = param.defaultValue;
        }
      });
      setFormParams(newParams);
      // Immediately call onParamsChange to set initial default parameters in the parent
      // This ensures parent has the defaults even if user doesn't change anything.
      onParamsChange(newParams); 
      logger.debug(`StrategyParameterForm: Initialized/updated params for strategy ${strategy.name}`, newParams);
    } else {
      setFormParams({}); // Clear params if no strategy is selected
      onParamsChange({}); // Notify parent of cleared params
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy]); // Removed initialParams from dependency array to avoid loops if parent updates initialParams based on onParamsChange

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target;
    let processedValue: any = value;

    if (type === 'number') {
      processedValue = parseFloat(value);
      if (isNaN(processedValue)) processedValue = ''; // Or handle error, or keep as string for controlled input
    } else if (type === 'checkbox') {
      processedValue = (event.target as HTMLInputElement).checked;
    }

    const updatedParams = {
      ...formParams,
      [name]: processedValue,
    };
    setFormParams(updatedParams);
    onParamsChange(updatedParams);
    logger.debug(`StrategyParameterForm: Parameter ${name} changed to`, processedValue);
  };

  if (!strategy) {
    // Return null or a minimal placeholder if no strategy is selected, 
    // BacktestRunnerPage already shows a message if needed, or this component handles it.
    return <p className="info-message">Select a strategy to see its parameters.</p>; 
  }

  return (
    <div className="strategy-parameters-form"> {/* main container class */}
      <h4>{strategy.name} Parameters</h4>
      {strategy.description && <p className="strategy-description"><small>{strategy.description}</small></p>}
      <div className="form-grid"> {/* Use form-grid for better layout of parameters */}
        {strategy.parameters.map((param: StrategyParameterDefinition) => (
          <div key={param.name} className="form-group"> {/* Each parameter in its own group */}
            <label htmlFor={param.name} title={param.description}>
              {param.label}
            </label>
            {param.type === 'number' && (
              <input
                type="number"
                id={param.name}
                name={param.name}
                value={formParams[param.name] !== undefined ? String(formParams[param.name]) : String(param.defaultValue)}
                onChange={handleInputChange}
                min={param.min}
                max={param.max}
                step={param.step}
              />
            )}
            {param.type === 'string' && (
              <input
                type="text"
                id={param.name}
                name={param.name}
                value={formParams[param.name] !== undefined ? String(formParams[param.name]) : String(param.defaultValue)}
                onChange={handleInputChange}
              />
            )}
            {param.type === 'boolean' && (
              <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  id={param.name}
                  name={param.name}
                  checked={formParams[param.name] !== undefined ? Boolean(formParams[param.name]) : Boolean(param.defaultValue)}
                  onChange={handleInputChange}
                  style={{ width: 'auto', marginInlineEnd: '0.5rem' }} /* Override width for checkbox */
                />
                {/* Optional: if you want the label text next to the checkbox itself, not above - but label is already above */}
              </div>
            )}
            {param.description && <small className="param-description" style={{ display: 'block', marginTop: '0.25rem' }}>{param.description}</small>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StrategyParameterForm;
