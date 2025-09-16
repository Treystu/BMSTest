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

type ProcessedDataPoint = {
    timestamp: number;
    [key: string]: any; 
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

// Metrics that are typically percentages (0-100)
const leftAxisMetrics = new Set(['soc', 'capacity']);


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

  const { leftMetrics, rightMetrics } = useMemo(() => {
    const left: string[] = [];
    const right: string[] = [];
    activeMetrics.forEach(metric => {
        if (leftAxisMetrics.has(metric.toLowerCase())) {
            left.push(metric);
        } else {
            right.push(metric);
        }
    });
    return { leftMetrics: left, rightMetrics: right };
  }, [activeMetrics]);

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
    
    if (timeFilteredData.length < 2) return timeFilteredData;

    // 2. Sort data just in case it's not
    const sortedData = timeFilteredData.sort((a, b) => a.timestamp - b.timestamp);

    // 3. Insert nulls for large time gaps
    const dataWithGaps: ProcessedDataPoint[] = [sortedData[0]];
    for (let i = 1; i < sortedData.length; i++) {
        const prevPoint = sortedData[i-1];
        const currentPoint = sortedData[i];
        
        if (currentPoint.timestamp - prevPoint.timestamp > TIME_GAP_THRESHOLD) {
            // Create a gap point. Recharts will not connect lines over a null.
            const gapPoint = { timestamp: prevPoint.timestamp + (TIME_GAP_THRESHOLD / 2) };
            activeMetrics.forEach(metric => {
                gapPoint[metric] = null;
            });
            dataWithGaps.push(gapPoint);
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
      const allData = data;
      // We need to map brush range from processedData back to the original `data` array
      const brushDataSubset = processedData.slice(range.startIndex, range.endIndex + 1).filter(d => d !== null && d[activeMetrics[0]] !== null);

      if(brushDataSubset.length > 0) {
        const firstTimestamp = brushDataSubset[0]!.timestamp;
        const lastTimestamp = brushDataSubset[brushDataSubset.length - 1]!.timestamp;
        
        const startIndexInOriginal = allData.findIndex(d => d.timestamp >= firstTimestamp);
        let endIndexInOriginal = -1;
        for (let i = allData.length - 1; i >= 0; i--) {
            if (allData[i].timestamp <= lastTimestamp) {
                endIndexInOriginal = i;
                break;
            }
        }
        
        if(startIndexInOriginal !== -1 && endIndexInOriginal !== -1) {
            onBrushChange({startIndex: startIndexInOriginal, endIndex: endIndexInOriginal});
        } else {
            onBrushChange(null);
        }

      } else {
        onBrushChange(null);
      }
    }
  }, [onBrushChange, processedData, data, activeMetrics]);

  const CustomTooltipContent = (props: any) => {
    const { active, payload, label } = props;
    if (active && payload && payload.length) {
        const dataPoint = payload[0].payload;
        if(dataPoint[payload[0].dataKey] === null) return null; // Don't show tooltip for gaps
        return (
            <div className="p-2 bg-background border rounded-md shadow-lg text-sm">
                <p className="font-bold">{getFormattedTick(label, "MMM d, yyyy, h:mm:ss a")}</p>
                {payload.map((p: any) => {
                    const metric = p.dataKey;
                    const color = p.color;
                    const value = p.value;
                    if (value === null || value === undefined) return null;
                    
                    return(
                        <div key={metric} style={{ color }}>
                            <p>{chartConfig[metric]?.label}: {value?.toFixed(3)}</p>
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
          {chartInfo?.description || 'Time-based trend of extracted metrics.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[450px] w-full">
            <LineChart
                accessibilityLayer
                data={processedData}
                margin={{
                  top: 5,
                  right: 20,
                  left: 20,
                  bottom: 20,
                }}
            >
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value, index) => {
                      if (processedData[index]?.[activeMetrics[0]] === null) return "";
                      const visibleRange = processedData.length > 1 ? processedData[processedData.length-1].timestamp - processedData[0].timestamp : 0;
                      const oneDay = 24 * 60 * 60 * 1000;
                      const format = visibleRange <= oneDay * 2 ? 'HH:mm' : 'MMM d';
                      return getFormattedTick(value, format);
                    }}
                    scale="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    interval="preserveStartEnd"
                />
                <YAxis yAxisId="left" orientation="left" stroke="hsl(var(--foreground))" domain={['dataMin - 1', 'dataMax + 1']} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--foreground))" domain={['dataMin - 2', 'dataMax + 2']}/>
                <Tooltip
                    content={<CustomTooltipContent />}
                />
                <Legend />
                {leftMetrics.map((metric) => (
                     <Line
                        key={metric}
                        yAxisId="left"
                        type="monotone"
                        dataKey={metric}
                        stroke={chartConfig[metric].color}
                        strokeWidth={2}
                        dot={false}
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
                        stroke={chartConfig[metric].color}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
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
                  data={processedData.filter(d => d[activeMetrics[0]] !== null)}
                />
            </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
