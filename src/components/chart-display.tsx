"use client";

import { useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer
} from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Brush, Legend, Tooltip } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataPoint, ChartInfo, SelectedMetrics } from '@/lib/types';
import { subDays, subWeeks, subMonths } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export type BrushRange = {
  startIndex?: number;
  endIndex?: number;
};

type ChartDisplayProps = {
  batteryId: string;
  data: DataPoint[];
  selectedMetrics: SelectedMetrics;
  dateRange: string;
  chartInfo: ChartInfo | null;
  isLoading: boolean;
  onBrushChange: (range: BrushRange | null) => void;
};

type AggregatedDataPoint = {
    timestamp: number;
    count: number;
    [key: string]: any; // for avg, min, max values
};

const lineColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const getFormattedTick = (tick: any, format: string) => {
    if (typeof tick === 'number') {
        try {
            return formatInTimeZone(tick, 'UTC', format);
        } catch (e) {
            console.error('Date formatting error in getFormattedTick:', e);
            return '';
        }
    }
    return '';
};

const TIME_GAP_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours
const AGGREGATION_WINDOW = 15 * 60 * 1000; // 15 minutes

const CustomLine = (props: any) => {
    const { points, dataKey, stroke, strokeWidth } = props;
    const segments: any[] = [];
    let currentSegment: any[] = [];

    points.forEach((p: any, index: number) => {
        currentSegment.push(p);
        if (index < points.length - 1) {
            const nextPoint = points[index + 1];
            if (nextPoint.payload.isGap) {
                segments.push(currentSegment);
                currentSegment = [];
            }
        }
    });
    segments.push(currentSegment);

    return (
        <g>
            {segments.map((segment, index) => {
                if(segment.length === 0) return null;
                const path = segment.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                // Find a representative point to check for aggregation
                const pointPayload = segment[0].payload;
                const isAggregated = pointPayload.count > 1;
                const finalStrokeWidth = isAggregated ? parseFloat(strokeWidth) * 2.5 : strokeWidth;

                return <path key={index} d={path} fill="none" stroke={stroke} strokeWidth={finalStrokeWidth} />;
            })}
        </g>
    );
};


export function ChartDisplay({
  batteryId,
  data,
  selectedMetrics,
  dateRange,
  chartInfo,
  isLoading,
  onBrushChange,
}: ChartDisplayProps) {

  const activeMetrics = useMemo(() => Object.keys(selectedMetrics).filter(k => selectedMetrics[k as keyof SelectedMetrics]), [selectedMetrics]);

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // 1. Filter by date range
    let timeFilteredData: DataPoint[];
    const now = new Date();
    switch (dateRange) {
        case '1d': timeFilteredData = data.filter(d => d.timestamp >= subDays(now, 1).getTime()); break;
        case '1w': timeFilteredData = data.filter(d => d.timestamp >= subWeeks(now, 1).getTime()); break;
        case '1m': timeFilteredData = data.filter(d => d.timestamp >= subMonths(now, 1).getTime()); break;
        default: timeFilteredData = data;
    }
    
    if (timeFilteredData.length === 0) return [];

    // 2. Aggregate data into 15-minute buckets
    const aggregatedBuckets = new Map<number, DataPoint[]>();
    for (const point of timeFilteredData) {
        const bucketTimestamp = Math.floor(point.timestamp / AGGREGATION_WINDOW) * AGGREGATION_WINDOW;
        if (!aggregatedBuckets.has(bucketTimestamp)) {
            aggregatedBuckets.set(bucketTimestamp, []);
        }
        aggregatedBuckets.get(bucketTimestamp)!.push(point);
    }
    
    // 3. Process buckets into final data points with stats
    const finalData: AggregatedDataPoint[] = [];
    for (const [timestamp, points] of aggregatedBuckets) {
        const count = points.length;
        const newPoint: AggregatedDataPoint = { timestamp, count };

        if (count === 1) {
            const point = points[0];
            activeMetrics.forEach(metric => {
                newPoint[metric] = point[metric];
            });
        } else {
            activeMetrics.forEach(metric => {
                const values = points.map(p => p[metric]).filter(v => v !== undefined && v !== null) as number[];
                if (values.length > 0) {
                    const sum = values.reduce((a, b) => a + b, 0);
                    newPoint[`${metric}_avg`] = sum / values.length;
                    newPoint[`${metric}_min`] = Math.min(...values);
                    newPoint[`${metric}_max`] = Math.max(...values);
                    // Use the average value as the main value for the line
                    newPoint[metric] = newPoint[`${metric}_avg`];
                }
            });
        }
        finalData.push(newPoint);
    }
    finalData.sort((a,b) => a.timestamp - b.timestamp);
    
    // 4. Insert nulls for large time gaps
    if (finalData.length < 2) return finalData;

    const dataWithGaps: any[] = [finalData[0]];
    for (let i = 1; i < finalData.length; i++) {
        const prevPoint = finalData[i-1];
        const currentPoint = finalData[i];
        
        if (currentPoint.timestamp - prevPoint.timestamp > TIME_GAP_THRESHOLD) {
            dataWithGaps.push({ timestamp: prevPoint.timestamp + TIME_GAP_THRESHOLD / 2, isGap: true });
        }
        dataWithGaps.push(currentPoint);
    }

    return dataWithGaps;
  }, [data, dateRange, activeMetrics]);
  
  const chartConfig = useMemo(() => {
    const config: any = {};
    activeMetrics.forEach((metric, index) => {
        config[metric] = {
            label: metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            color: lineColors[index % lineColors.length],
        };
    });
    return config;
  }, [activeMetrics]);

  const handleBrushChange = useCallback((range: BrushRange | undefined) => {
    if (range?.startIndex === undefined || range?.endIndex === undefined) {
      onBrushChange(null);
    } else {
      // Note: We need to map the brush range from the original `data` array, not the one with nulls
      const allData = data;
      const brushDataSubset = processedData.slice(range.startIndex, range.endIndex + 1).filter(d => d !== null);
      if(brushDataSubset.length > 0) {
        const firstTimestamp = brushDataSubset[0]!.timestamp;
        const lastTimestamp = brushDataSubset[brushDataSubset.length - 1]!.timestamp;
        const startIndexInOriginal = allData.findIndex(d => d.timestamp >= firstTimestamp);
        const endIndexInOriginal = allData.findLastIndex(d => d.timestamp <= lastTimestamp);
        onBrushChange({startIndex: startIndexInOriginal, endIndex: endIndexInOriginal});
      } else {
        onBrushChange(null);
      }
    }
  }, [onBrushChange, processedData, data]);

  const CustomTooltipContent = (props: any) => {
    const { active, payload, label } = props;
    if (active && payload && payload.length) {
        const dataPoint = payload[0].payload;
        return (
            <div className="p-2 bg-background border rounded-md shadow-lg text-sm">
                <p className="font-bold">{getFormattedTick(label, "MMM d, yyyy, h:mm:ss a")}</p>
                {dataPoint.count > 1 && <p className="text-xs text-muted-foreground mb-2">({dataPoint.count} points in 15min)</p>}
                {payload.map((p: any) => {
                    const metric = p.dataKey;
                    const color = p.color;
                    if(dataPoint[metric] === undefined) return null;
                    
                    return(
                        <div key={metric} style={{ color }}>
                            {dataPoint.count === 1 ? (
                                <p>{chartConfig[metric]?.label}: {dataPoint[metric]?.toFixed(3)}</p>
                            ) : (
                                <>
                                    <p className="font-semibold">{chartConfig[metric]?.label}</p>
                                    <ul className="pl-3">
                                        <li>Avg: {dataPoint[`${metric}_avg`]?.toFixed(3)}</li>
                                        <li>Min: {dataPoint[`${metric}_min`]?.toFixed(3)}</li>
                                        <li>Max: {dataPoint[`${metric}_max`]?.toFixed(3)}</li>
                                    </ul>
                                </>
                            )}
                        </div>
                    )
                })}
            </div>
        );
    }
    return null;
  };
  
  if (isLoading && data.length === 0) {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
                <Skeleton className="aspect-video w-full" />
            </CardContent>
        </Card>
    );
  }

  if (!batteryId || data.length === 0) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Trend Chart</CardTitle>
                <CardDescription>Your data visualization will appear here.</CardDescription>
            </CardHeader>
            <CardContent className="flex aspect-video w-full items-center justify-center rounded-lg border-dashed border-2 bg-muted/50">
                <p className="text-muted-foreground">
                  { !batteryId ? "Select a battery to view its chart." : "No data to display yet for this battery." }
                </p>
            </CardContent>
        </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{chartInfo?.title || `Trends for ${batteryId}`}</CardTitle>
        <CardDescription>
          {chartInfo?.description || 'Time-based trend of extracted metrics. Thicker lines represent aggregated 15-minute intervals.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[450px] w-full">
            <LineChart
                accessibilityLayer
                data={processedData}
                margin={{
                  top: 5,
                  right: 10,
                  left: 10,
                  bottom: 20,
                }}
            >
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value, index) => {
                      if (processedData[index]?.isGap) return "";
                      const format = (dateRange === '1d') ? 'HH:mm' : 'MMM d';
                      return getFormattedTick(value, format);
                    }}
                    scale="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    interval="preserveStartEnd"
                />
                <YAxis />
                <Tooltip
                    content={<CustomTooltipContent />}
                />
                <Legend />
                {Object.keys(chartConfig).map((metric) => (
                     <Line
                        key={metric}
                        dataKey={metric}
                        stroke={chartConfig[metric].color}
                        strokeWidth={2}
                        dot={false}
                        animationDuration={300}
                        connectNulls={false}
                        isAnimationActive={false} // Important for custom line
                        content={<CustomLine />}
                    />
                ))}
                <Brush 
                  dataKey="timestamp"
                  height={30}
                  stroke="hsl(var(--primary))"
                  tickFormatter={(value) => getFormattedTick(value, 'MMM d')}
                  onChange={handleBrushChange}
                  startIndex={undefined}
                  endIndex={undefined}
                  data={processedData}
                />
            </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
