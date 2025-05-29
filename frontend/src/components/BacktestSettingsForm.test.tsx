import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import BacktestSettingsForm from './BacktestSettingsForm';
import type { BacktestSettings } from '../types';
import { logger } from '../utils/logger';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockInitialSettings: BacktestSettings = {
  symbol: 'BTCUSDT',
  startDate: '2023-01-01',
  endDate: '2023-12-31',
  initialCash: 10000,
  sourceApi: 'Binance',
  interval: '1d',
};

describe('BacktestSettingsForm', () => {
  let mockOnSettingsChange: jest.Mock;

  beforeEach(() => {
    mockOnSettingsChange = jest.fn();
    mockedAxios.get.mockReset(); // Reset axios mock before each test
    (logger.info as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
    (logger.warn as jest.Mock).mockClear();
  });

  test('renders all form fields correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: ['BTCUSDT', 'ETHUSDT'] });
    render(
      <BacktestSettingsForm
        initialSettings={mockInitialSettings}
        onSettingsChange={mockOnSettingsChange}
      />
    );

    // Wait for symbols to load if necessary, though not strictly needed for checking static fields
    await waitFor(() => expect(screen.getByLabelText(/Symbol:/i)).toBeInTheDocument());

    expect(screen.getByLabelText(/Symbol:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Start Date:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/End Date:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Initial Cash:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Source API/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Interval/i)).toBeInTheDocument();
  });

  describe('Symbol Dropdown Functionality', () => {
    test('displays loading state, then populates symbols and defaults correctly when initial symbol is in list', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      mockedAxios.get.mockResolvedValueOnce({ data: symbols });

      render(
        <BacktestSettingsForm
          initialSettings={{ ...mockInitialSettings, symbol: 'ETHUSDT' }} // Initial symbol is in the list
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const symbolSelect = screen.getByLabelText(/Symbol:/i) as HTMLSelectElement;
      expect(symbolSelect).toBeDisabled(); // Should be disabled while loading
      expect(screen.getByRole('option', { name: 'Loading symbols...' })).toBeInTheDocument();

      await waitFor(() => {
        expect(symbolSelect).not.toBeDisabled();
        expect(screen.queryByText('Loading symbols...')).not.toBeInTheDocument();
      });
      
      expect(screen.getByRole('option', { name: 'BTCUSDT' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'ETHUSDT' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'ADAUSDT' })).toBeInTheDocument();
      expect(symbolSelect.value).toBe('ETHUSDT'); // Initial symbol is maintained

      // onSettingsChange should not have been called just for populating if initial symbol was valid
      expect(mockOnSettingsChange).not.toHaveBeenCalledWith(expect.objectContaining({ symbol: symbols[0] }));
    });

    test('displays loading state, then populates symbols and defaults to first symbol if initial symbol is empty', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      mockedAxios.get.mockResolvedValueOnce({ data: symbols });
      const initialSettingsEmptySymbol = { ...mockInitialSettings, symbol: '' };

      render(
        <BacktestSettingsForm
          initialSettings={initialSettingsEmptySymbol}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const symbolSelect = screen.getByLabelText(/Symbol:/i) as HTMLSelectElement;
      expect(screen.getByRole('option', { name: 'Loading symbols...' })).toBeInTheDocument();
      
      await waitFor(() => {
        expect(symbolSelect.value).toBe(symbols[0]);
      });

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: symbols[0] })
      );
    });
    
    test('displays loading state, then populates symbols and defaults to first symbol if initial symbol is not in list', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      mockedAxios.get.mockResolvedValueOnce({ data: symbols });
      const initialSettingsInvalidSymbol = { ...mockInitialSettings, symbol: 'XYZABC' };

      render(
        <BacktestSettingsForm
          initialSettings={initialSettingsInvalidSymbol}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const symbolSelect = screen.getByLabelText(/Symbol:/i) as HTMLSelectElement;
      expect(screen.getByRole('option', { name: 'Loading symbols...' })).toBeInTheDocument();
      
      await waitFor(() => {
        expect(symbolSelect.value).toBe(symbols[0]);
      });

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: symbols[0] })
      );
       expect(logger.info).toHaveBeenCalledWith(`Current symbol 'XYZABC' is invalid or empty. Defaulting to first symbol: ${symbols[0]}`);
    });


    test('handles API error when fetching symbols', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

      render(
        <BacktestSettingsForm
          initialSettings={mockInitialSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const symbolSelect = screen.getByLabelText(/Symbol:/i) as HTMLSelectElement;
      expect(screen.getByRole('option', { name: 'Loading symbols...' })).toBeInTheDocument();

      await waitFor(() => {
        expect(symbolSelect).toBeDisabled(); // Remains disabled on error
      });
      
      expect(screen.getByRole('option', { name: 'Error loading symbols' })).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch symbols.')).toBeInTheDocument(); // Error message below dropdown
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching symbols for BacktestSettingsForm:',
        expect.any(Error)
      );
    });
    
    test('handles case where no symbols are returned from API', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: [] }); // Empty array of symbols

      render(
        <BacktestSettingsForm
          initialSettings={mockInitialSettings}
          onSettingsChange={mockOnSettingsChange}
        />
      );
      
      const symbolSelect = screen.getByLabelText(/Symbol:/i) as HTMLSelectElement;
      expect(screen.getByRole('option', { name: 'Loading symbols...' })).toBeInTheDocument();

      await waitFor(() => {
         expect(symbolSelect).toBeDisabled();
      });
      expect(screen.getByRole('option', { name: 'No symbols available' })).toBeInTheDocument();
      expect(logger.warn).toHaveBeenCalledWith('No symbols fetched from the API.');
    });

    test('allows user to change symbol selection', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      mockedAxios.get.mockResolvedValueOnce({ data: symbols });

      render(
        <BacktestSettingsForm
          initialSettings={{ ...mockInitialSettings, symbol: 'BTCUSDT' }}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const symbolSelect = screen.getByLabelText(/Symbol:/i) as HTMLSelectElement;
      await waitFor(() => expect(symbolSelect.value).toBe('BTCUSDT'));

      fireEvent.change(symbolSelect, { target: { value: 'ETHUSDT' } });
      
      expect(symbolSelect.value).toBe('ETHUSDT');
      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'ETHUSDT' })
      );
    });
  });

  test('updates other form fields and calls onSettingsChange', async () => {
     mockedAxios.get.mockResolvedValueOnce({ data: ['BTCUSDT', 'ETHUSDT'] }); // For symbol dropdown
    render(
      <BacktestSettingsForm
        initialSettings={mockInitialSettings}
        onSettingsChange={mockOnSettingsChange}
      />
    );
    
    await waitFor(() => expect(screen.getByLabelText(/Symbol:/i)).not.toBeDisabled());

    const startDateInput = screen.getByLabelText(/Start Date:/i);
    fireEvent.change(startDateInput, { target: { value: '2023-02-01' } });
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2023-02-01' })
    );

    const initialCashInput = screen.getByLabelText(/Initial Cash:/i);
    fireEvent.change(initialCashInput, { target: { value: '5000' } });
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ initialCash: 5000 })
    );
  });
});
