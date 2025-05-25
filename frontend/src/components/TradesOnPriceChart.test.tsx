// frontend/src/components/TradesOnPriceChart.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TradesOnPriceChart from './TradesOnPriceChart';
import { HistoricalDataPoint, Trade as FrontendTradeType } from '../types'; // Assuming types are in ../types

// Mock Recharts components
jest.mock('recharts', () => {
  const OriginalRecharts = jest.requireActual('recharts');
  return {
    ...OriginalRecharts,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    ComposedChart: ({ children, data }: { children: React.ReactNode, data: any[] }) => (
      <div data-testid="composed-chart" data-chartdata={JSON.stringify(data)}>{children}</div>
    ),
    Line: ({ dataKey, name }: { dataKey: string, name: string }) => <div data-testid={`line-${name.toLowerCase().replace(/\s+/g, '-')}`} data-datakey={dataKey}></div>,
    Scatter: ({ name, data }: { name: string, data: any[] }) => (
      <div data-testid={`scatter-${name.toLowerCase().replace(/\s+/g, '-')}`} data-scatterdata={JSON.stringify(data)}></div>
    ),
    XAxis: ({ dataKey }: { dataKey: string }) => <div data-testid="x-axis" data-datakey={dataKey}></div>,
    YAxis: ({ dataKey }: { dataKey?: string }) => <div data-testid="y-axis" data-datakey={dataKey || 'default'}></div>, // dataKey is optional for YAxis
    CartesianGrid: () => <div data-testid="cartesian-grid"></div>,
    Tooltip: () => <div data-testid="tooltip"></div>,
    Legend: () => <div data-testid="legend"></div>,
  };
});

// Mock formatters
jest.mock('../utils/formatters', () => ({
    formatDateForChart: jest.fn((timestamp) => new Date(timestamp * 1000).toLocaleDateString()),
    formatDateTimeForChart: jest.fn((timestamp) => new Date(timestamp * 1000).toLocaleString()),
    formatCurrency: jest.fn((value) => `$${value.toFixed(2)}`),
}));

describe('TradesOnPriceChart Component', () => {
  const mockPriceData: HistoricalDataPoint[] = [
    { timestamp: 1672531200, open: 100, high: 105, low: 98, close: 102, volume: 1000 },
    { timestamp: 1672617600, open: 102, high: 108, low: 100, close: 105, volume: 1200 },
    { timestamp: 1672704000, open: 105, high: 110, low: 103, close: 103, volume: 1100 },
  ];

  // Using FrontendTradeType which matches the structure passed from BacktestRunnerPage
  const mockTradesInput: Array<{entryTimestamp: number, entryPrice: number, type: 'buy' | 'sell', amount: number}> = [
    { entryTimestamp: 1672531200, entryPrice: 102, type: 'buy', amount: 10 },
    { entryTimestamp: 1672704000, entryPrice: 103, type: 'sell', amount: 5 },
  ];
  
  // This is how the component transforms mockTradesInput internally for the Scatter plots
   const expectedBuyScatterData = [
    { timestamp: 1672531200, price: 102, amount: 10, type: 'BUY' }
  ];
  const expectedSellScatterData = [
    { timestamp: 1672704000, price: 103, amount: 5, type: 'SELL' }
  ];


  beforeEach(() => {
    (require('../utils/formatters').formatDateForChart as jest.Mock).mockClear();
    (require('../utils/formatters').formatDateTimeForChart as jest.Mock).mockClear();
    (require('../utils/formatters').formatCurrency as jest.Mock).mockClear();
  });

  test('renders without crashing with valid data', () => {
    render(<TradesOnPriceChart priceData={mockPriceData} tradesData={mockTradesInput} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
  });

  test('renders key Recharts components when data is provided', () => {
    render(<TradesOnPriceChart priceData={mockPriceData} tradesData={mockTradesInput} />);
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis')).toBeInTheDocument(); // Main YAxis for price
    expect(screen.getByTestId('line-price')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-buy-orders')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-sell-orders')).toBeInTheDocument();
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  test('passes correct data and dataKey to ComposedChart and Line components', () => {
    render(<TradesOnPriceChart priceData={mockPriceData} tradesData={mockTradesInput} />);
    
    const composedChart = screen.getByTestId('composed-chart');
    const chartDataString = composedChart.getAttribute('data-chartdata');
    expect(chartDataString).toBeDefined();
    const chartData = JSON.parse(chartDataString!);
    expect(chartData).toEqual(mockPriceData); // Main chart data is priceData

    const priceLine = screen.getByTestId('line-price');
    expect(priceLine.getAttribute('data-datakey')).toBe('close');
    
    const xAxis = screen.getByTestId('x-axis');
    expect(xAxis.getAttribute('data-datakey')).toBe('timestamp');
    
    const yAxis = screen.getByTestId('y-axis'); // Main YAxis for price
    expect(yAxis.getAttribute('data-datakey')).toBe('close');
  });

  test('passes transformed/filtered trade data to Scatter components', () => {
    render(<TradesOnPriceChart priceData={mockPriceData} tradesData={mockTradesInput} />);

    const buyScatter = screen.getByTestId('scatter-buy-orders');
    const buyScatterDataString = buyScatter.getAttribute('data-scatterdata');
    expect(buyScatterDataString).toBeDefined();
    const buyScatterData = JSON.parse(buyScatterDataString!);
    // The component transforms tradesData. The mockTradesInput is what BacktestRunnerPage would pass.
    // The component itself filters and maps this.
    expect(buyScatterData).toEqual(expectedBuyScatterData);

    const sellScatter = screen.getByTestId('scatter-sell-orders');
    const sellScatterDataString = sellScatter.getAttribute('data-scatterdata');
    expect(sellScatterDataString).toBeDefined();
    const sellScatterData = JSON.parse(sellScatterDataString!);
    expect(sellScatterData).toEqual(expectedSellScatterData);
  });

  test('renders "No price data" message when priceData is empty', () => {
    render(<TradesOnPriceChart priceData={[]} tradesData={mockTradesInput} />);
    expect(screen.getByText('No price data available to display the chart.')).toBeInTheDocument();
    expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
  });
  
  test('renders "No price data" message when priceData is null', () => {
    // @ts-ignore
    render(<TradesOnPriceChart priceData={null} tradesData={mockTradesInput} />);
    expect(screen.getByText('No price data available to display the chart.')).toBeInTheDocument();
  });


  test('renders chart correctly even if tradesData is empty', () => {
    render(<TradesOnPriceChart priceData={mockPriceData} tradesData={[]} />);
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument(); // Chart should still render
    expect(screen.getByTestId('line-price')).toBeInTheDocument(); // Price line should be there

    // Scatter data should be empty
    const buyScatter = screen.getByTestId('scatter-buy-orders');
    const buyScatterData = JSON.parse(buyScatter.getAttribute('data-scatterdata')!);
    expect(buyScatterData).toEqual([]);

    const sellScatter = screen.getByTestId('scatter-sell-orders');
    const sellScatterData = JSON.parse(sellScatter.getAttribute('data-scatterdata')!);
    expect(sellScatterData).toEqual([]);
  });
});
