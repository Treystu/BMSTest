
"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush, ResponsiveContainer, Curve
} from 'recharts';
import { useMemo } from 'react';
import type { ProcessedDataPoint, SelectedMetrics } from '@/lib/types';
import { formatInTimeZone } from 'date-fns-tz';

const lineColors = {
  soc: "hsl(var(--chart-1))",
  voltage: "hsl(var(--chart-2))",
  current: "hsl(var(--chart-3))",
  capacity: "hsl(var(--chart-4))",
  temperature: "hsl(var(--chart-5))",
};

const getLineColor = (metric: string) => lineColors[metric as keyof typeof lineColors] || "hsl(var(--foreground))";

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
        const dataPoint = payload[0].payload as ProcessedDataPoint;

        return (
            <div className="p-3 bg-background border rounded-lg shadow-xl text-sm space-y-2">
                <p className="font-bold">{formatInTimeZone(new Date(label), 'UTC', "MMM d, yyyy, h:mm:ss a")}</p>
                {payload.map((p: any) => {
                    const metric = p.dataKey as string;
                    if (p.value === null || p.value === undefined) return null;
                    
                    if (dataPoint.type === 'aggregate' && dataPoint.stats[metric]) {
                        const stats = dataPoint.stats[metric];
                        return (
                             <div key={metric} style={{ color: p.color }} className="p-2 rounded-md bg-muted/50">
                                <p className="capitalize font-semibold">{metric}:</p>
                                <ul className="list-disc list-inside text-muted-foreground">
                                    <li>Avg: {stats.avg.toFixed(3)}</li>
                                    <li>Min: {stats.min.toFixed(3)}</li>
                                    <li>Max: {stats.max.toFixed(3)}</li>
                                    <li>Count: {stats.count}</li>
                                </ul>
                            </div>
                        )
                    }
                    
                    return(
                        <div key={metric} style={{ color: p.color }} className="flex justify-between items-center">
                            <p className="capitalize font-semibold">{metric}:</p> 
                            <p className="font-mono ml-4">{p.value?.toFixed(3)}</p>
                        </div>
                    )
                })}
            </div>
        );
    }
    return null;
};

// Custom line renderer to handle dynamic thickness
const CustomLine = (props: any) => {
    const { points, dataKey } = props;
    
    if (!points || points.length === 0) {
        return null;
    }
    
    const pathSegments = [];
    let currentSegmentPoints: any[] = [];

    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const isAggregated = point.payload.type === 'aggregate';
        
        // Start a new segment if the type changes or it's the first point
        if (i === 0) {
            currentSegmentPoints.push(point);
            continue;
        }

        const prevPoint = points[i-1];
        const wasAggregated = prevPoint.payload.type === 'aggregate';
        const isGap = point.payload[dataKey] === null || prevPoint.payload[dataKey] === null;

        if (isAggregated !== wasAggregated || isGap) {
            if (currentSegmentPoints.length > 1) {
                pathSegments.push(
                    <Curve
                        {...props}
                        key={`seg-${pathSegments.length}`}
                        points={currentSegmentPoints}
                        strokeWidth={wasAggregated ? 4 : 2}
                        className="recharts-line-curve"
                    />
                );
            }
             currentSegmentPoints = isGap ? [] : [prevPoint, point];
        } else {
            currentSegmentPoints.push(point);
        }
    }
    
    // Render the last segment
    if (currentSegmentPoints.length > 1) {
        const isLastSegmentAggregated = currentSegmentPoints[0].payload.type === 'aggregate';
        pathSegments.push(
            <Curve
                {...props}
                key={`seg-${pathSegments.length}`}
                points={currentSegmentPoints}
                strokeWidth={isLastSegmentAggregated ? 4 : 2}
                className="recharts-line-curve"
            />
        );
    }

    return <g>{pathSegments}</g>;
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

    return { leftMetrics: left, rightMetrics: right };
  }, [selectedMetrics]);

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
            isAnimationActive={false}
            content={<CustomLine />}
            connectNulls={false}
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
            isAnimationActive={false}
            content={<CustomLine />}
            connectNulls={false}
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
