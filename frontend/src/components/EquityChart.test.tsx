// frontend/src/components/EquityChart.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EquityChart from './EquityChart';
import { EquityDataPoint } from '../types'; // Assuming EquityDataPoint is defined in types.ts or directly in EquityChart

// Mock Recharts components
jest.mock('recharts', () => {
  const OriginalRecharts = jest.requireActual('recharts');
  return {
    ...OriginalRecharts,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    LineChart: ({ children, data }: { children: React.ReactNode, data: any[] }) => (
      <div data-testid="line-chart" data-chartdata={JSON.stringify(data)}>{children}</div>
    ),
    Line: ({ dataKey }: { dataKey: string }) => <div data-testid="line" data-datakey={dataKey}></div>,
    XAxis: ({ dataKey }: { dataKey: string }) => <div data-testid="x-axis" data-datakey={dataKey}></div>,
    YAxis: () => <div data-testid="y-axis"></div>,
    CartesianGrid: () => <div data-testid="cartesian-grid"></div>,
    Tooltip: () => <div data-testid="tooltip"></div>,
    Legend: () => <div data-testid="legend"></div>,
  };
});

// Mock formatters from utils as they are used internally by the chart for ticks/tooltips
// If not mocked, their actual implementation (e.g., new Date()) might run.
// For these tests, we are more focused on props passed to Recharts components.
jest.mock('../utils/formatters', () => ({
    formatDateForChart: jest.fn((timestamp) => new Date(timestamp * 1000).toLocaleDateString()),
    formatCurrency: jest.fn((value) => `$${value.toFixed(2)}`),
}));


describe('EquityChart Component', () => {
  const mockPortfolioHistory: EquityDataPoint[] = [
    { timestamp: 1672531200, value: 10000 }, // Jan 1, 2023
    { timestamp: 1672617600, value: 10050 }, // Jan 2, 2023
    { timestamp: 1672704000, value: 10020 }, // Jan 3, 2023
  ];

  beforeEach(() => {
    // Clear any mocks that track calls, if necessary
    (require('../utils/formatters').formatDateForChart as jest.Mock).mockClear();
    (require('../utils/formatters').formatCurrency as jest.Mock).mockClear();
  });

  test('renders without crashing with valid data', () => {
    render(<EquityChart data={mockPortfolioHistory} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  test('renders key Recharts components when data is provided', () => {
    render(<EquityChart data={mockPortfolioHistory} />);
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    expect(screen.getByTestId('line')).toBeInTheDocument();
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  test('passes correct data and dataKey to LineChart and Line components', () => {
    render(<EquityChart data={mockPortfolioHistory} />);
    
    const lineChart = screen.getByTestId('line-chart');
    // Recharts data prop is transformed slightly by the component (adds formatted date string etc.)
    // The mock captures the data prop as passed by EquityChart to the LineChart component.
    // EquityChart directly passes the `data` prop it receives to LineChart.
    const chartDataString = lineChart.getAttribute('data-chartdata');
    expect(chartDataString).toBeDefined();
    const chartData = JSON.parse(chartDataString!);
    expect(chartData).toEqual(mockPortfolioHistory); // component passes data prop directly

    const line = screen.getByTestId('line');
    expect(line.getAttribute('data-datakey')).toBe('value');
    
    const xAxis = screen.getByTestId('x-axis');
    expect(xAxis.getAttribute('data-datakey')).toBe('timestamp');
  });

  test('renders "No equity data" message when data is empty', () => {
    render(<EquityChart data={[]} />);
    expect(screen.getByText('No equity data available to display the chart.')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument(); // Chart itself should not render
  });

  test('renders "No equity data" message when data is null', () => {
    // @ts-ignore to test null case for data prop
    render(<EquityChart data={null} />);
    expect(screen.getByText('No equity data available to display the chart.')).toBeInTheDocument();
  });
  
  test('renders "No equity data" message when data is undefined', () => {
    // @ts-ignore to test undefined case for data prop
    render(<EquityChart data={undefined} />);
    expect(screen.getByText('No equity data available to display the chart.')).toBeInTheDocument();
  });

  // Test that formatters are used by Recharts components (indirectly via props)
  // This is tricky with the current simple mock. A more advanced mock could allow checking props of XAxis/YAxis/Tooltip.
  // For now, we assume if the chart renders, Recharts uses the tickFormatter/labelFormatter props correctly.
  // The formatters themselves are mocked above to ensure they don't break tests.
});
