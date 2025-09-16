
"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush, ResponsiveContainer
} from 'recharts';
import { useMemo } from 'react';
import type { DataPoint, SelectedMetrics } from '@/lib/types';
import { formatInTimeZone } from 'date-fns-tz';

const lineColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

// Define which metrics belong to which axis
const leftAxisMetricSet = new Set(['soc', 'capacity']);

// Dynamically format the timestamp on the X-axis based on the visible data range
const getFormattedTimestamp = (ts: number, rangeInMs: number) => {
    if (isNaN(ts)) return "";
    try {
        const oneDay = 24 * 60 * 60 * 1000;
        // If range is less than 2 days, show time. Otherwise, show date.
        const formatStr = rangeInMs <= oneDay * 2 ? 'HH:mm' : 'MMM d';
        return formatInTimeZone(new Date(ts), 'UTC', formatStr);
    } catch (e) {
        return "";
    }
};

const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        // Do not render tooltip for null gap points
        if(payload[0].value === null) return null; 

        const firstTimestamp = payload[0].payload.timestamp;

        return (
            <div className="p-2 bg-background border rounded-md shadow-lg text-sm">
                <p className="font-bold">{formatInTimeZone(new Date(firstTimestamp), 'UTC', "MMM d, yyyy, h:mm:ss a")}</p>
                {payload.map((p: any, index: number) => {
                    const metric = p.dataKey;
                    const value = p.value;
                    if (value === null || value === undefined) return null;
                    
                    return(
                        <div key={metric} style={{ color: p.color || lineColors[index % lineColors.length] }}>
                            <p className="capitalize">{metric}: {value?.toFixed(3)}</p>
                        </div>
                    )
                })}
            </div>
        );
    }
    return null;
};

type BatteryTrendChartProps = {
    processedData: DataPoint[];
    brushData: DataPoint[];
    selectedMetrics: SelectedMetrics;
    onBrushChange: (range: {startIndex?: number, endIndex?: number} | undefined) => void;
}

export function BatteryTrendChart({ processedData, brushData, selectedMetrics, onBrushChange }: BatteryTrendChartProps) {
  
  // 1. Separate metrics for left and right Y-axes and assign them stable colors.
  const { leftMetrics, rightMetrics, metricColorMap } = useMemo(() => {
    const left: string[] = [];
    const right: string[] = [];
    const colors: { [key: string]: string } = {};
    let colorIndex = 0;
    
    Object.keys(selectedMetrics).forEach(metric => {
        if (selectedMetrics[metric as keyof SelectedMetrics]) {
            if (leftAxisMetricSet.has(metric.toLowerCase())) {
                left.push(metric);
            } else {
                right.push(metric);
            }
            colors[metric] = lineColors[colorIndex % lineColors.length];
            colorIndex++;
        }
    });

    return { leftMetrics: left, rightMetrics: right, metricColorMap: colors };
  }, [selectedMetrics]);

  // Calculate the visible time range to dynamically adjust the X-axis tick format.
  const visibleRange = useMemo(() => {
      if(processedData.length < 2) return 0;
      const first = processedData[0]?.timestamp;
      const last = processedData[processedData.length - 1]?.timestamp;
      return last - first;
  }, [processedData]);

  return (
    <ResponsiveContainer width="100%" height={450}>
      <LineChart data={processedData} margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value) => getFormattedTimestamp(value, visibleRange)}
          interval="preserveStartEnd"
        />
        {/* 2. Define two Y-axes with unique IDs */}
        <YAxis yAxisId="left" orientation="left" stroke="hsl(var(--foreground))" domain={['dataMin - 1', 'dataMax + 1']} />
        <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--foreground))" domain={['dataMin - 2', 'dataMax + 2']}/>
        
        <Tooltip content={<CustomTooltipContent />} />
        <Legend />
        
        {/* 3. Render lines for the left axis, ensuring connectNulls is false */}
        {leftMetrics.map((metric) => (
          <Line
            key={metric}
            yAxisId="left"
            type="monotone"
            dataKey={metric}
            stroke={metricColorMap[metric]}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}

        {/* 4. Render lines for the right axis, ensuring connectNulls is false */}
        {rightMetrics.map((metric) => (
          <Line
            key={metric}
            yAxisId="right"
            type="monotone"
            dataKey={metric}
            stroke={metricColorMap[metric]}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}

        {/* 5. Use the clean 'brushData' for the Brush component */}
        <Brush
          dataKey="timestamp"
          height={30}
          stroke="hsl(var(--primary))"
          tickFormatter={(value) => formatInTimeZone(new Date(value), 'UTC', 'MMM d')}
          onChange={onBrushChange}
          data={brushData}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
