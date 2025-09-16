
"use client";

import { useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataPoint, ChartInfo, SelectedMetrics } from '@/lib/types';
import { subDays, subWeeks, subMonths } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush, ResponsiveContainer
} from 'recharts';

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

const lineColors: { [key: string]: string } = {
  soc: "hsl(var(--chart-1))",
  voltage: "hsl(var(--chart-2))",
  current: "hsl(var(--chart-3))",
  capacity: "hsl(var(--chart-4))",
  temperature: "hsl(var(--chart-5))",
};

const getLineColor = (metric: string): string => {
    if (lineColors[metric]) {
        return lineColors[metric];
    }
    let hash = 0;
    for (let i = 0; i < metric.length; i++) {
        hash = metric.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, 70%, 50%)`;
};

const leftAxisMetricSet = new Set(['soc', 'capacity']);

const getFormattedTimestamp = (ts: number, rangeInMs: number) => {
    if (isNaN(ts)) return "";
    try {
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
                    p.value !== null && p.value !== undefined && (
                        <div key={p.dataKey} style={{ color: p.color }} className="flex justify-between items-center">
                            <p className="capitalize font-semibold">{p.dataKey}:</p>
                            <p className="font-mono ml-4">{p.value?.toFixed(3)}</p>
                        </div>
                    )
                ))}
            </div>
        );
    }
    return null;
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

  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const now = new Date();
    const timeFilteredData = data.filter(d => {
        if (d.timestamp === null || d.timestamp === undefined) return false;
        switch (dateRange) {
            case '1d': return d.timestamp >= subDays(now, 1).getTime();
            case '1w': return d.timestamp >= subWeeks(now, 1).getTime();
            case '1m': return d.timestamp >= subMonths(now, 1).getTime();
            default: return true;
        }
    });

    // This is the most critical part: ensuring the data is sorted chronologically.
    return [...timeFilteredData].sort((a, b) => a.timestamp - b.timestamp);

  }, [data, dateRange]);
  
  const handleBrushChangeCallback = useCallback((range: { startIndex?: number, endIndex?: number } | undefined) => {
    if (range?.startIndex === undefined || range?.endIndex === undefined) {
      onBrushChange(null);
      return;
    }
    
    const startTimestamp = sortedData[range.startIndex]?.timestamp;
    const endTimestamp = sortedData[range.endIndex]?.timestamp;
    
    if (startTimestamp === undefined || endTimestamp === undefined) {
      onBrushChange(null);
      return;
    }

    const startIndexInOriginal = data.findIndex(d => d.timestamp === startTimestamp);
    const endIndexInOriginal = data.findIndex(d => d.timestamp === endTimestamp);
      
    if(startIndexInOriginal !== -1 && endIndexInOriginal !== -1) {
        onBrushChange({startIndex: startIndexInOriginal, endIndex: endIndexInOriginal});
    } else {
        onBrushChange(null);
    }
  }, [onBrushChange, sortedData, data]);

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
      if(sortedData.length < 2) return 0;
      const first = sortedData[0].timestamp;
      const last = sortedData[sortedData.length - 1].timestamp;
      return last - first;
  }, [sortedData]);

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

  if (!batteryId || sortedData.length < 2) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Trend Chart</CardTitle>
                <CardDescription>Your data visualization will appear here.</CardDescription>
            </CardHeader>
            <CardContent className="flex aspect-video w-full items-center justify-center rounded-lg border-dashed border-2 bg-muted/50">
                <p className="text-muted-foreground">
                  { !batteryId ? "Select a battery to view its chart." : "Not enough data to display for the selected range." }
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
        <ResponsiveContainer width="100%" height={450}>
          <LineChart data={sortedData} margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
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
                isAnimationActive={false}
              />
            ))}

            <Brush
              dataKey="timestamp"
              height={30}
              stroke="hsl(var(--primary))"
              tickFormatter={(value) => formatInTimeZone(new Date(value), 'UTC', 'MMM d')}
              onChange={handleBrushChangeCallback}
              data={sortedData}
              startIndex={sortedData.length > 100 ? sortedData.length - 100 : 0}
              endIndex={sortedData.length - 1}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
