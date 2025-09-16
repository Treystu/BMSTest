"use client";

import { useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Brush } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataPoint, ChartInfo, SelectedMetrics } from '@/lib/types';
import { subDays, subWeeks, subMonths } from 'date-fns';
import { format as formatInTimeZone } from 'date-fns-tz';


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

const lineColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const getFormattedTick = (value: any, format: string): string => {
  if (typeof value !== 'number' || isNaN(value)) {
    // If value is not a valid number, return it as a string.
    // Recharts might pass other types, so this is a safe fallback.
    return String(value);
  }
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      // If the number doesn't convert to a valid date, return original value.
      return String(value);
    }
    return formatInTimeZone(date, 'UTC', format);
  } catch (e) {
    // In case of any other unexpected error from the formatting library.
    console.error("Date formatting error:", e);
    return String(value);
  }
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
    return [...data].sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const filteredData = useMemo(() => {
    if (dateRange === 'all') return sortedData;
    const now = Date.now();
    let startTime: number;

    switch (dateRange) {
      case '1d':
        startTime = subDays(now, 1).getTime();
        break;
      case '1w':
        startTime = subWeeks(now, 1).getTime();
        break;
      case '1m':
        startTime = subMonths(now, 1).getTime();
        break;
      default:
        return sortedData;
    }
    return sortedData.filter(d => d.timestamp >= startTime);
  }, [sortedData, dateRange]);
  
  const activeMetrics = useMemo(() => Object.keys(selectedMetrics).filter(k => selectedMetrics[k as keyof SelectedMetrics]), [selectedMetrics]);
  
  const chartConfig = useMemo(() => {
    const config: any = {};
    let colorIndex = 0;
    activeMetrics.forEach((metric) => {
        if(filteredData.some(d => d[metric] !== undefined && d[metric] !== null)){
            config[metric] = {
                label: metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                color: lineColors[colorIndex % lineColors.length],
            };
            colorIndex++;
        }
    });
    return config;
  }, [activeMetrics, filteredData]);

  const handleBrushChange = useCallback((range: BrushRange | undefined) => {
    if (range?.startIndex === undefined || range?.endIndex === undefined) {
      onBrushChange(null);
    } else {
      onBrushChange(range);
    }
  }, [onBrushChange]);
  
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
                data={filteredData}
                margin={{
                  top: 5,
                  right: 10,
                  left: 10,
                  bottom: 20, // Increased bottom margin for Brush
                }}
            >
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => {
                      const format = (dateRange === '1h' || dateRange === '1d') ? 'HH:mm' : 'MMM d';
                      return getFormattedTick(value, format);
                    }}
                    scale="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                />
                <YAxis />
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent 
                        indicator="line" 
                        labelFormatter={(label, payload) => {
                           const timestamp = payload?.[0]?.payload?.timestamp;
                           return getFormattedTick(timestamp, "MMM d, yyyy, h:mm:ss a");
                        }}
                    />}
                />
                 <ChartLegend content={<ChartLegendContent />} />
                {Object.keys(chartConfig).map((metric) => (
                    <Line
                        key={metric}
                        type="monotone"
                        dataKey={metric}
                        stroke={chartConfig[metric].color}
                        strokeWidth={2}
                        dot={false}
                        connectNulls // This will connect line segments across null values.
                        animationDuration={300}
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
                />
            </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
