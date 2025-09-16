
"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush, ResponsiveContainer
} from 'recharts';
import { useMemo } from 'react';
import type { ProcessedDataPoint, SelectedMetrics } from '@/lib/types';
import { formatInTimeZone } from 'date-fns-tz';

const lineColors: { [key: string]: string } = {
  soc: "hsl(var(--chart-1))",
  voltage: "hsl(var(--chart-2))",
  current: "hsl(var(--chart-3))",
  capacity: "hsl(var(--chart-4))",
  temperature: "hsl(var(--chart-5))",
};

const getLineColor = (metric: string): string => {
    // Fallback for dynamically added metrics
    if (lineColors[metric]) {
        return lineColors[metric];
    }
    // Generate a consistent color based on the metric name hash
    let hash = 0;
    for (let i = 0; i < metric.length; i++) {
        hash = metric.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, 70%, 50%)`;
};


// Metrics that are typically percentages (0-100)
const leftAxisMetricSet = new Set(['soc', 'capacity']);

const getFormattedTimestamp = (ts: number, rangeInMs: number) => {
    if (isNaN(ts)) return "";
    try {
        // Use a more detailed format for smaller time ranges
        const oneDay = 24 * 60 * 60 * 1000;
        const formatStr = rangeInMs <= oneDay * 2 ? 'HH:mm' : 'MMM d';
        return formatInTimeZone(new Date(ts), 'UTC', formatStr);
    } catch (e) {
        return "";
    }
};

const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="p-3 bg-background border rounded-lg shadow-xl text-sm space-y-2">
                <p className="font-bold">{formatInTimeZone(new Date(label), 'UTC', "MMM d, yyyy, h:mm:ss a")}</p>
                {payload.map((p: any) => (
                    <div key={p.dataKey} style={{ color: p.color }} className="flex justify-between items-center">
                        <p className="capitalize font-semibold">{p.dataKey}:</p> 
                        <p className="font-mono ml-4">{p.value?.toFixed(3)}</p>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};


type BatteryTrendChartProps = {
    processedData: ProcessedDataPoint[];
    brushData: ProcessedDataPoint[];
    selectedMetrics: SelectedMetrics;
    onBrushChange: (range: {startIndex?: number, endIndex?: number} | undefined) => void;
}

export function BatteryTrendChart({ processedData, brushData, selectedMetrics, onBrushChange }: BatteryTrendChartProps) {
  
  const { leftMetrics, rightMetrics } = useMemo(() => {
    const left: string[] = [];
    const right: string[] = [];
    
    Object.keys(selectedMetrics).forEach(metric => {
        if (selectedMetrics[metric as keyof SelectedMetrics]) {
            if (leftAxisMetricSet.has(metric.toLowerCase())) {
                left.push(metric);
            } else {
                right.push(metric);
            }
        }
    });

    return { leftMetrics, rightMetrics };
  }, [selectedMetrics]);

  const visibleRange = useMemo(() => {
      if(processedData.length < 2) return 0;
      // Filter out null gap points before calculating range
      const timestamps = processedData.map(p => p.timestamp).filter((t): t is number => t !== null && t !== undefined);
      if (timestamps.length < 2) return 0;
      const first = Math.min(...timestamps);
      const last = Math.max(...timestamps);
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
        <YAxis yAxisId="left" orientation="left" stroke="hsl(var(--foreground))" domain={['dataMin - 1', 'dataMax + 1']} />
        <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--foreground))" domain={['dataMin - 2', 'dataMax + 2']}/>
        
        <Tooltip content={<CustomTooltipContent />} />
        <Legend />
        
        {leftMetrics.map((metric) => (
          <Line
            key={metric}
            yAxisId="left"
            type="monotone"
            dataKey={metric}
            stroke={getLineColor(metric)}
            dot={false}
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
        
        {rightMetrics.map((metric) => (
          <Line
            key={metric}
            yAxisId="right"
            type="monotone"
            dataKey={metric}
            stroke={getLineColor(metric)}
            dot={false}
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}

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
