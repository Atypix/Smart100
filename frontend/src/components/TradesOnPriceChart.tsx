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
} from 'recharts';
import type { HistoricalDataPoint as FrontendHistoricalDataPoint } from '../types'; // Adjust path if needed
import type { Trade as FrontendTrade } from '../types'; // Adjust path if needed
import { formatDateForChart, formatCurrency, formatDateTimeForChart } from '../utils/formatters'; // Import centralized formatters

import type { AIDecision } from '../types'; // Import AIDecision
import { Customized } from 'recharts'; // Import Customized

// Props for the component
interface TradesOnPriceChartProps {
  priceData: ReadonlyArray<FrontendHistoricalDataPoint>; 
  tradesData: ReadonlyArray<FrontendTrade>; 
  aiDecisionLog?: ReadonlyArray<AIDecision>; // New prop for AI decision log
}

interface AIStrategySegment {
  startTimestamp: number;
  endTimestamp: number;
  chosenStrategyId: string | null;
  chosenStrategyName: string | null;
  parametersUsed: Record<string, any> | null; // Keep for potential detailed display later
}

// Custom component to render AI decision annotations
const AIDecisionAnnotations: React.FC<any> = (props) => {
  const { data, xAxisMap, yAxisMap, width, segments } = props; // Removed height

  if (!segments || segments.length === 0 || !xAxisMap || !xAxisMap[0] || !yAxisMap || !yAxisMap[0] || !data || data.length === 0) {
    return null;
  }
  
  const chartTopMargin = props.offset?.top || 5; 
  const yPosition = chartTopMargin + 10; 

  const colors = ["#FFDDC1", "#C2F0C2", "#BDE0FE", "#FFFACD", "#E6E6FA", "#FFCCF9", "#D4A5A5", "#FDFD96", "#C1E1C5", "#BED3F3"];
  let colorIndex = 0;
  const strategyColorMap = new Map<string, string>();

  return (
    <g>
      {segments.map((segment: AIStrategySegment, index: number) => {
        if (!segment.chosenStrategyId) return null;

        const startX = xAxisMap[0].apply(segment.startTimestamp, { bandAware: true });
        let endX = xAxisMap[0].apply(segment.endTimestamp, { bandAware: true });
        
        // Ensure endX is at least startX (can happen if segment is for a single data point)
        if (endX < startX) endX = startX + 1; // Make it a minimal visible line/area

        const segmentWidth = Math.max(0, endX - startX);

        if (startX < 0 && (startX + segmentWidth) < 0) return null; 
        if (startX > width) return null;

        let color = strategyColorMap.get(segment.chosenStrategyId);
        if (!color) {
            color = colors[colorIndex % colors.length];
            strategyColorMap.set(segment.chosenStrategyId, color);
            colorIndex++;
        }
        
        const clipPathId = `clip-segment-${index}`;
        const visibleStartX = Math.max(0, startX);
        const visibleWidth = Math.min(segmentWidth, width - visibleStartX);

        if (visibleWidth <=0) return null; // Nothing to render if not visible

        return (
          <React.Fragment key={`segment-${index}`}>
            <defs>
              <clipPath id={clipPathId}>
                <rect x={visibleStartX} y={chartTopMargin} width={visibleWidth} height={20} />
              </clipPath>
            </defs>
            <rect
              x={visibleStartX}
              y={chartTopMargin}
              width={visibleWidth}
              height={20} 
              fill={color}
              opacity={0.25} 
            />
            <text
              x={visibleStartX + visibleWidth / 2}
              y={yPosition + 7} // Adjusted for better vertical centering in a 20px band
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#333" 
              fontSize="10"
              fontWeight="bold"
              clipPath={`url(#${clipPathId})`}
            >
              {segment.chosenStrategyName || segment.chosenStrategyId || 'N/A'}
            </text>
          </React.Fragment>
        );
      })}
    </g>
  );
};


const TradesOnPriceChart: React.FC<TradesOnPriceChartProps> = ({ priceData, tradesData, aiDecisionLog }) => {
  const [aiDecisionSegments, setAiDecisionSegments] = React.useState<AIStrategySegment[]>([]);

  React.useEffect(() => {
    if (aiDecisionLog && aiDecisionLog.length > 0 && priceData && priceData.length > 0) {
      const segments: AIStrategySegment[] = [];
      let currentSegment: AIStrategySegment | null = null;

      for (let i = 0; i < priceData.length; i++) {
        const currentDataPoint = priceData[i];
        const currentTimestamp = currentDataPoint.timestamp;

        // Find the latest AI decision that occurred at or before the current data point's timestamp
        const relevantAIDecision = [...aiDecisionLog] // Create a copy to sort without mutating prop
            .sort((a, b) => b.timestamp - a.timestamp) // Sort descending by timestamp
            .find(d => d.timestamp <= currentTimestamp);

        const activeStrategyId = relevantAIDecision?.chosenStrategyId || null;
        const activeStrategyName = relevantAIDecision?.chosenStrategyName || null;
        const activeParameters = relevantAIDecision?.parametersUsed || null;

        if (!currentSegment) {
          if (activeStrategyId) { // Start a new segment if there's an active strategy
            currentSegment = {
              startTimestamp: currentTimestamp,
              endTimestamp: currentTimestamp, // Will be updated
              chosenStrategyId: activeStrategyId,
              chosenStrategyName: activeStrategyName,
              parametersUsed: activeParameters,
            };
          }
        } else {
          // Check if strategy or its parameters changed
          const paramsChanged = JSON.stringify(currentSegment.parametersUsed) !== JSON.stringify(activeParameters);
          if (currentSegment.chosenStrategyId !== activeStrategyId || (activeStrategyId && paramsChanged)) {
            // Strategy or params changed, finalize previous segment
            currentSegment.endTimestamp = priceData[i-1].timestamp; // Ends at the previous data point
            segments.push(currentSegment);
            
            if (activeStrategyId) { // Start a new segment
              currentSegment = {
                startTimestamp: currentTimestamp,
                endTimestamp: currentTimestamp,
                chosenStrategyId: activeStrategyId,
                chosenStrategyName: activeStrategyName,
                parametersUsed: activeParameters,
              };
            } else {
              currentSegment = null; // No strategy active for this new period
            }
          } else {
            // Strategy is the same, just extend the endTimestamp
            currentSegment.endTimestamp = currentTimestamp;
          }
        }
      }

      // Finalize the last segment after the loop
      if (currentSegment) {
        currentSegment.endTimestamp = priceData[priceData.length - 1].timestamp;
        segments.push(currentSegment);
      }
      setAiDecisionSegments(segments);
    } else {
      setAiDecisionSegments([]);
    }
  }, [aiDecisionLog, priceData]);


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
          data={[...priceData]} // Main data for X-axis and price line, spread into new array
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
          
          {/* AI Decision Annotations */}
          {aiDecisionSegments.length > 0 && (
            <Customized component={(props: any) => <AIDecisionAnnotations {...props} segments={aiDecisionSegments} />} />
          )}

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
