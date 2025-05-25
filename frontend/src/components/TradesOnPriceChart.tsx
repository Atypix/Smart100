// frontend/src/components/TradesOnPriceChart.tsx
import React from 'react';
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot, // For individual markers if needed, but Scatter is better for series
  ZAxis, // Needed if scatter point sizes vary, not strictly needed here
  ZAxis, // Needed if scatter point sizes vary, not strictly needed here
} from 'recharts';
import { HistoricalDataPoint } from '../../../src/services/dataService'; // Adjust path if needed
import { Trade } from '../../../src/backtest'; // Adjust path if needed
import { formatDateForChart, formatCurrency, formatDateTimeForChart } from '../utils/formatters'; // Import centralized formatters

// Props for the component
interface TradesOnPriceChartProps {
  priceData: ReadonlyArray<HistoricalDataPoint>; // Using HistoricalDataPoint which has { timestamp, close, ... }
  tradesData: ReadonlyArray<Trade>; // Using Trade from backtest which has { timestamp, price, action, ... }
}

const TradesOnPriceChart: React.FC<TradesOnPriceChartProps> = ({ priceData, tradesData }) => {
  if (!priceData || priceData.length === 0) {
    return <p>No price data available to display the chart.</p>;
  }

  // Prepare data for Recharts
  // Price data is already in a good format (timestamp, close)
  // Trades data needs to be mapped for scatter plots
  const buyTrades = tradesData
    .filter(trade => trade.action === 'BUY')
    .map(trade => ({
      timestamp: trade.timestamp, // X value
      price: trade.price,         // Y value
      amount: trade.sharesTraded, // For tooltip or ZAxis if sizing markers
      type: 'BUY',
    }));

  const sellTrades = tradesData
    .filter(trade => trade.action === 'SELL')
    .map(trade => ({
      timestamp: trade.timestamp,
      price: trade.price,
      amount: trade.sharesTraded,
      type: 'SELL',
    }));

  // Combine price data with trade data for unified X-axis domain and tooltips
  // This is complex if we want tooltips to show price *and* trade info at the same point.
  // For simplicity, Recharts will show tooltips based on the main dataKey of the chart (priceData).
  // We can use custom tooltips or ensure trade timestamps align with price data timestamps.
  // For now, let's assume priceData provides the main timeline.

  return (
    <div style={{ width: '100%', height: 400, marginTop: '20px' }}>
      <h4>Price Chart with Trades</h4>
      <ResponsiveContainer>
        <ComposedChart
          data={priceData} // Main data for X-axis and price line
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 20, // Increased bottom margin for X-axis label
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatDateForChart} // Use imported formatter
            name="Date"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            label={{ value: "Date", position: "insideBottom", offset: -15 }}
          />
          <YAxis
            dataKey="close" // Assuming 'close' price is the primary Y-axis for the line
            tickFormatter={formatCurrency} // Use imported formatter
            name="Price"
            label={{ value: 'Price (USD)', angle: -90, position: 'insideLeft' }}
            domain={['auto', 'auto']} // Auto-adjust domain based on price data
          />
          <Tooltip
            labelFormatter={formatDateTimeForChart} // Use date-time for tooltip for more precision
            formatter={(value: any, name: string, props: any) => {
              // props.payload contains the full data point for that tooltip entry
              if (name === 'Price') {
                return [formatCurrency(value as number), name]; // Use imported formatter
              }
              if (name === 'Buy Orders' || name === 'Sell Orders') {
                const tradeInfo = props.payload; // { timestamp, price, amount, type }
                return [`${tradeInfo.type} @ ${formatCurrency(tradeInfo.price)} (Vol: ${tradeInfo.amount})`, name]; // Use imported formatter
              }
              return [value, name];
            }}
          />
          <Legend verticalAlign="top" height={36}/>
          
          {/* Price Line */}
          <Line
            type="monotone"
            dataKey="close"
            name="Price"
            stroke="#8884d8"
            dot={false}
            yAxisId={0} // Default Y-axis
          />

          {/* Buy Markers */}
          <Scatter
            name="Buy Orders"
            data={buyTrades} // Use the prepared buyTrades data
            // dataKey="timestamp" // X-axis is implicitly from the main data prop of ComposedChart if not specified here
                               // However, for scatter, it's better to ensure `buyTrades` has `timestamp` and map it to the XAxis
            fill="green"
            shape="triangle" // 'star', 'square', 'cross', 'diamond', 'triangle', 'wye'
            yAxisId={0} // Default Y-axis
          >
            {/* This mapping is needed if we want to ensure each dot is a ReferenceDot linked to the main XAxis scale */}
            {/* However, Scatter with its own data prop containing 'timestamp' and 'price' should work directly */}
          </Scatter>

          {/* Sell Markers */}
          <Scatter
            name="Sell Orders"
            data={sellTrades}
            fill="red"
            shape="triangle" // Use inverted triangle or different shape if possible via custom shape prop
                            // Recharts built-in shapes: 'circle' (default), 'cross', 'diamond', 'square', 'star', 'triangle', 'wye'.
                            // For inverted triangle, a custom SVG shape would be needed. Let's use 'cross' for differentiation for now.
            shape="cross" 
            yAxisId={0} // Default Y-axis
          />
          
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
// Note: For `shape="triangle"`, sell orders might need a custom shape for inversion or use a different shape.
// Recharts' default triangle points up. A common alternative is to use 'cross' or 'star' for sells.

export default TradesOnPriceChart;
