// frontend/src/components/EquityChart.tsx
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatDateForChart, formatCurrency } from '../utils/formatters'; // Import centralized formatters
import type { EquityDataPoint } from '../types'; // Import from centralized types

interface EquityChartProps {
  data: ReadonlyArray<EquityDataPoint>;
}

const EquityChart: React.FC<EquityChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <p>No equity data available to display the chart.</p>;
  }

  // Transform data for Recharts: Recharts typically expects data keys to be consistent.
  // The 'timestamp' needs to be formatted for the XAxis, but the original numeric value
  // can be used for sorting and data integrity. The 'value' is the portfolio value.
  const chartData = data.map(item => ({
    ...item,
    // Recharts XAxis dataKey will be 'timestamp'. We use tickFormatter for display.
    // 'value' is directly used for YAxis dataKey.
  }));


  return (
    <div style={{ width: '100%', height: 400 }}>
      <h4>Portfolio Equity Over Time</h4>
      <ResponsiveContainer>
        <LineChart
          data={chartData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatDateForChart} // Use imported formatter
            name="Date"
            type="number" // Important: timestamp is numeric
            domain={['dataMin', 'dataMax']} // Ensure all data points are shown
            scale="time" // Helps Recharts understand this is time-based data
            // Consider adding label={{ value: "Date", position: "insideBottomRight", offset: 0 }}
          />
          <YAxis
            tickFormatter={formatCurrency}
            name="Portfolio Value"
            label={{ value: 'Portfolio Value (USD)', angle: -90, position: 'insideLeft' }}
            domain={['auto', 'auto']} // Adjust if needed, e.g. ['dataMin - 1000', 'dataMax + 1000']
          />
          <Tooltip
            labelFormatter={formatDateForChart} // Use imported formatter for tooltip label
            formatter={(value: number, name: string) => { // Format value in tooltip
              if (name === 'Portfolio Value') {
                return [formatCurrency(value), name]; // Use imported formatter
              }
              return [value, name];
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            name="Portfolio Value" // Name used in Legend and Tooltip
            stroke="#8884d8"
            activeDot={{ r: 8 }}
            dot={false} // Hide dots for cleaner line, or customize them
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EquityChart;
