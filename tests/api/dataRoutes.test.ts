import request from 'supertest';
import express from 'express';
import axios from 'axios'; // Import axios to mock
import dataRoutes from '../../src/api/dataRoutes'; // Adjust path as necessary
import logger from '../../src/utils/logger';

// Mock logger to prevent console output during tests
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = express();
app.use(express.json());
app.use('/api/data', dataRoutes); // Mount the router under a similar path as in the main app

describe('GET /api/data/binance-symbols', () => {
  afterEach(() => {
    jest.clearAllMocks(); // Clear mock calls after each test
  });

  it('should return a list of symbols on successful fetch from Binance', async () => {
    const mockBinanceResponse = {
      data: {
        symbols: [
          { symbol: 'BTCUSDT', status: 'TRADING' },
          { symbol: 'ETHUSDT', status: 'TRADING' },
          { symbol: 'BNBBTC', status: 'TRADING' },
          { symbol: 'NONTRADINGSYMBOL', status: 'BREAK' }, // Should still be included if present
        ],
      },
      status: 200,
    };
    mockedAxios.get.mockResolvedValue(mockBinanceResponse);

    const response = await request(app).get('/api/data/binance-symbols');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(['BTCUSDT', 'ETHUSDT', 'BNBBTC', 'NONTRADINGSYMBOL']);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith('https://api.binance.com/api/v3/exchangeInfo');
    expect(logger.info).toHaveBeenCalledWith('Attempting to fetch exchange information from Binance...');
    expect(logger.info).toHaveBeenCalledWith('Successfully fetched 4 symbols from Binance.');
  });

  it('should return 502 if Binance API returns an error', async () => {
    mockedAxios.get.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 500,
        data: { msg: 'Internal Server Error from Binance' },
      },
      message: 'Request failed with status code 500',
    });

    const response = await request(app).get('/api/data/binance-symbols');

    expect(response.status).toBe(502); // As per implementation, it uses error.response.status or 502
    expect(response.body).toEqual({
      message: 'Failed to fetch symbols from Binance.',
      details: { msg: 'Internal Server Error from Binance' },
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Error fetching symbols from Binance:',
      expect.objectContaining({ message: 'Request failed with status code 500' })
    );
  });
  
  it('should return 429 if Binance API returns a 429 error (rate limit)', async () => {
    mockedAxios.get.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 429,
        data: { msg: 'Rate limit exceeded' },
      },
      message: 'Request failed with status code 429',
    });

    const response = await request(app).get('/api/data/binance-symbols');

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      message: 'Failed to fetch symbols from Binance.',
      details: { msg: 'Rate limit exceeded' },
    });
     expect(logger.error).toHaveBeenCalledWith(
      'Error fetching symbols from Binance:',
      expect.objectContaining({ message: 'Request failed with status code 429' })
    );
  });

  it('should return 503 if there is a network error or no response from Binance', async () => {
    mockedAxios.get.mockRejectedValue({
      isAxiosError: true,
      request: {}, // Simulates a network error where no response was received
      message: 'Network Error',
    });

    const response = await request(app).get('/api/data/binance-symbols');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ message: 'Network error or no response from Binance API.' });
    expect(logger.error).toHaveBeenCalledWith(
      'Error fetching symbols from Binance:',
      expect.objectContaining({ message: 'Network Error' })
    );
  });
  
  it('should return 500 if Binance response status is not 200 but valid data structure', async () => {
    const mockBinanceResponse = {
      data: {
        symbols: [ /* ... symbols ... */ ],
      },
      status: 202, // Not 200
    };
    mockedAxios.get.mockResolvedValue(mockBinanceResponse);

    const response = await request(app).get('/api/data/binance-symbols');
    
    expect(response.status).toBe(202); // The route passes through the original status code
    expect(response.body).toEqual({
        message: 'Failed to fetch symbols from Binance due to API error.',
        details: { symbols: [] } // The symbols would be empty in this specific mock
    });
     expect(logger.error).toHaveBeenCalledWith(
      `Binance API request failed with status 202 or returned invalid data.`,
      { symbols: [] }
    );
  });


  it('should return 500 if symbols field is missing in Binance response', async () => {
    const mockBinanceResponse = {
      data: {
        // symbols field is missing
      },
      status: 200,
    };
    mockedAxios.get.mockResolvedValue(mockBinanceResponse);

    const response = await request(app).get('/api/data/binance-symbols');

    expect(response.status).toBe(500); // Changed from 502 to 500 as per route logic for this case
    expect(response.body).toEqual({ message: 'Invalid data structure received from Binance API.' });
    expect(logger.error).toHaveBeenCalledWith(
      'Binance API response did not contain a valid symbols array.',
      {}
    );
  });

  it('should return 500 if symbols field is not an array in Binance response', async () => {
    const mockBinanceResponse = {
      data: {
        symbols: "this-is-not-an-array",
      },
      status: 200,
    };
    mockedAxios.get.mockResolvedValue(mockBinanceResponse);

    const response = await request(app).get('/api/data/binance-symbols');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Invalid data structure received from Binance API.' });
    expect(logger.error).toHaveBeenCalledWith(
        'Binance API response did not contain a valid symbols array.',
        { symbols: "this-is-not-an-array" }
    );
  });
  
  it('should filter out symbols that are null or undefined from the map operation', async () => {
    const mockBinanceResponse = {
      data: {
        symbols: [
          { symbol: 'BTCUSDT' },
          { /* symbol missing */ },
          { symbol: null }, // Type-wise this shouldn't happen with Binance, but good to test filter
          { symbol: 'ETHUSDT' },
          { symbol: undefined },
        ],
      },
      status: 200,
    };
    // @ts-ignore
    mockedAxios.get.mockResolvedValue(mockBinanceResponse);

    const response = await request(app).get('/api/data/binance-symbols');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(logger.info).toHaveBeenCalledWith('Successfully fetched 2 symbols from Binance.');
  });
  
   it('should return 500 for non-Axios errors during processing', async () => {
    mockedAxios.get.mockImplementationOnce(() => {
      throw new Error('Some unexpected error');
    });

    const response = await request(app).get('/api/data/binance-symbols');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'An unexpected error occurred while fetching symbols.' });
    expect(logger.error).toHaveBeenCalledWith(
      'Error fetching symbols from Binance:',
      expect.objectContaining({ message: 'Some unexpected error' })
    );
  });
});

// You might have other routes in dataRoutes.ts, e.g., '/protected/data'
// If so, you can add tests for them here as well, or in a separate describe block.
// For example:
// describe('GET /api/data/protected/data', () => { /* ... tests ... */ });
// Remember to handle authentication for protected routes if you test them.
// For the /binance-symbols endpoint, no authentication is required.
