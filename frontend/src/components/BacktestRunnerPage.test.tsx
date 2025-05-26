// frontend/src/components/BacktestRunnerPage.test.tsx
/// <reference types="@testing-library/jest-dom" />
// import React from 'react'; // Removed as unused
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// import '@testing-library/jest-dom'; // Referenced via triple-slash directive
import axios from 'axios';
import type { AxiosError } from 'axios'; // Added type import for AxiosError
import BacktestRunnerPage from './BacktestRunnerPage';
import type { TradingStrategy, BacktestResult, ApiError } from '../types'; // Changed to type-only import
import { logger } from '../utils/logger'; // Adjust path

// Mock axios globally
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the logger to prevent console output during tests and allow assertions
jest.mock('../utils/logger', () => ({ // Adjust path as necessary
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockStrategies: TradingStrategy[] = [
  {
    id: 'strat1',
    name: 'Strategy One',
    description: 'Test Strategy 1',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', defaultValue: 10, description: 'Trading period' },
      { name: 'source', label: 'Source', type: 'string', defaultValue: 'close', description: 'Price source' },
    ],
  },
  {
    id: 'strat2',
    name: 'Strategy Two',
    description: 'Test Strategy 2',
    parameters: [{ name: 'threshold', label: 'Threshold', type: 'number', defaultValue: 0.5 }],
  },
];

const mockBacktestResult: BacktestResult = {
  symbol: 'BTCUSDT',
  startDate: new Date('2023-01-01').toISOString(),
  endDate: new Date('2023-03-31').toISOString(),
  initialPortfolioValue: 10000,
  finalPortfolioValue: 12000,
  totalProfitOrLoss: 2000,
  profitOrLossPercentage: 20,
  trades: [],
  totalTrades: 0,
  dataPointsProcessed: 90,
};

describe('BacktestRunnerPage', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
    (logger.info as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
  });

  test('renders without crashing and shows initial elements', () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] }); // For StrategySelector initial fetch
    render(<BacktestRunnerPage />);
    expect(screen.getByText('Backtest Configuration')).toBeInTheDocument();
    expect(screen.getByText('Select Strategy:')).toBeInTheDocument();
    expect(screen.getByText('Global Backtest Settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Backtest/i })).toBeInTheDocument();
  });

  test('fetches and displays strategies on mount', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: mockStrategies });
    render(<BacktestRunnerPage />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/strategies');
    });

    // Check if strategy options are populated
    expect(screen.getByRole('option', { name: /Strategy One/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Strategy Two/i })).toBeInTheDocument();
    expect(screen.queryByText(/Loading strategies.../i)).not.toBeInTheDocument();
  });

  test('displays error message if fetching strategies fails', async () => {
    const errorMessage = 'Failed to fetch strategies';
    const mockAxiosError = {
      isAxiosError: true,
      response: { data: { message: errorMessage }, status: 500, statusText: 'Internal Server Error', headers: {}, config: {} as any },
      message: errorMessage,
      name: 'AxiosError',
      code: 'ERR_BAD_RESPONSE',
      config: {} as any,
      toJSON: () => ({})
    } as AxiosError<ApiError>;
    mockedAxios.get.mockRejectedValueOnce(mockAxiosError);
    render(<BacktestRunnerPage />);

    await waitFor(() => {
      expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });
  });

  test('allows selecting a strategy and displays its parameters', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: mockStrategies });
    render(<BacktestRunnerPage />);
    
    await waitFor(() => expect(screen.getByRole('option', { name: 'Strategy One' })).toBeInTheDocument());

    const strategySelect = screen.getByLabelText(/Select Strategy:/i);
    fireEvent.change(strategySelect, { target: { value: 'strat1' } });

    await waitFor(() => {
      // Check if parameters for Strategy One are displayed
      expect(screen.getByText('Strategy One Parameters')).toBeInTheDocument();
      expect(screen.getByLabelText(/Period/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Source/i)).toBeInTheDocument();
    });
  });

  test('form interaction and successful backtest API call', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: mockStrategies }); // For StrategySelector
    mockedAxios.post.mockResolvedValueOnce({ data: mockBacktestResult }); // For POST /api/backtest

    render(<BacktestRunnerPage />);
    
    // 1. Select Strategy
    await waitFor(() => expect(screen.getByRole('option', { name: 'Strategy One' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Select Strategy:/i), { target: { value: 'strat1' } });
    await waitFor(() => expect(screen.getByLabelText(/Period/i)).toBeInTheDocument());

    // 2. Fill Strategy Parameters (using default values initially, but can change them)
    fireEvent.change(screen.getByLabelText(/Period/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/Source/i), { target: { value: 'open' } });

    // 3. Fill Backtest Settings
    fireEvent.change(screen.getByLabelText(/Symbol:/i), { target: { value: 'BTCUSDT' } });
    fireEvent.change(screen.getByLabelText(/Start Date:/i), { target: { value: '2023-01-01' } });
    fireEvent.change(screen.getByLabelText(/End Date:/i), { target: { value: '2023-03-31' } });
    fireEvent.change(screen.getByLabelText(/Initial Cash:/i), { target: { value: '10000' } });

    // 4. Click Run Backtest button
    fireEvent.click(screen.getByRole('button', { name: /Run Backtest/i }));

    // 5. Verify loading state and API call
    expect(screen.getByText(/Running backtest.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/backtest', {
        strategyId: 'strat1',
        strategyParams: { period: 20, source: 'open' }, // Updated params
        symbol: 'BTCUSDT',
        startDate: '2023-01-01',
        endDate: '2023-03-31',
        initialCash: 10000,
        sourceApi: 'Binance', // Default from initialBacktestSettings
        interval: '1d',      // Default from initialBacktestSettings
      });
    });

    // 6. Verify results display
    await waitFor(() => {
      expect(screen.getByText('Backtest Results')).toBeInTheDocument();
      expect(screen.getByText(`Symbol: ${mockBacktestResult.symbol}`)).toBeInTheDocument();
      expect(screen.getByText(`Final Portfolio Value: $${mockBacktestResult.finalPortfolioValue.toFixed(2)}`)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Running backtest.../i)).not.toBeInTheDocument();
  });

  test('displays error message if backtest API call fails', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: mockStrategies }); // StrategySelector
    const backtestErrorMessage = 'Backend backtest error';
    const mockAxiosError = {
      isAxiosError: true,
      response: { data: { message: backtestErrorMessage }, status: 400, statusText: 'Bad Request', headers: {}, config: {} as any },
      message: backtestErrorMessage,
      name: 'AxiosError',
      code: 'ERR_BAD_REQUEST',
      config: {} as any,
      toJSON: () => ({})
    } as AxiosError<ApiError>;
    mockedAxios.post.mockRejectedValueOnce(mockAxiosError);

    render(<BacktestRunnerPage />);
    
    await waitFor(() => expect(screen.getByRole('option', { name: 'Strategy One' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Select Strategy:/i), { target: { value: 'strat1' } });
    
    // Fill required backtest settings
    fireEvent.change(screen.getByLabelText(/Symbol:/i), { target: { value: 'BTCUSDT' } });
    // ... (other settings can use defaults or be set)

    fireEvent.click(screen.getByRole('button', { name: /Run Backtest/i }));

    await waitFor(() => {
      expect(screen.getByText(`Error running backtest: ${backtestErrorMessage}`)).toBeInTheDocument();
    });
  });
  
  test('run button should be disabled if no strategy is selected', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: mockStrategies });
    render(<BacktestRunnerPage />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Strategy One' })).toBeInTheDocument()); // Wait for strategies to load

    expect(screen.getByRole('button', { name: /Run Backtest/i })).toBeDisabled();

    // Select a strategy
    fireEvent.change(screen.getByLabelText(/Select Strategy:/i), { target: { value: 'strat1' } });
    expect(screen.getByRole('button', { name: /Run Backtest/i })).not.toBeDisabled();
  });

});
