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


const TIME_GAP_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

export function ChartDisplay({
  batteryId,
  data,
  selectedMetrics,
  dateRange,
  chartInfo,
  isLoading,
  onBrushChange,
}: ChartDisplayProps) {

  const filteredDataWithGaps = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    let timeFilteredData: DataPoint[];
    if (dateRange === 'all') {
      timeFilteredData = data;
    } else {
        const now = new Date();
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
            timeFilteredData = data;
            return timeFilteredData;
        }
        timeFilteredData = data.filter(d => d.timestamp >= startTime);
    }
    
    if (timeFilteredData.length < 2) return timeFilteredData;

    const dataWithNulls: (DataPoint | null)[] = [];
    dataWithNulls.push(timeFilteredData[0]);

    for (let i = 1; i < timeFilteredData.length; i++) {
        const prevPoint = timeFilteredData[i-1];
        const currentPoint = timeFilteredData[i];
        
        if (currentPoint.timestamp - prevPoint.timestamp > TIME_GAP_THRESHOLD) {
            // Insert a null point to create a visual gap in the chart
            dataWithNulls.push(null);
        }
        dataWithNulls.push(currentPoint);
    }

    return dataWithNulls;
  }, [data, dateRange]);
  
  const activeMetrics = useMemo(() => Object.keys(selectedMetrics).filter(k => selectedMetrics[k as keyof SelectedMetrics]), [selectedMetrics]);
  
  const chartConfig = useMemo(() => {
    const config: any = {};
    let colorIndex = 0;
    activeMetrics.forEach((metric) => {
        if(filteredDataWithGaps.some(d => d && d[metric] !== undefined && d[metric] !== null)){
            config[metric] = {
                label: metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                color: lineColors[colorIndex % lineColors.length],
            };
            colorIndex++;
        }
    });
    return config;
  }, [activeMetrics, filteredDataWithGaps]);

  const handleBrushChange = useCallback((range: BrushRange | undefined) => {
    if (range?.startIndex === undefined || range?.endIndex === undefined) {
      onBrushChange(null);
    } else {
      // Note: We need to map the brush range from the original `data` array, not the one with nulls
      const allData = data;
      const brushDataSubset = filteredDataWithGaps.slice(range.startIndex, range.endIndex + 1).filter(d => d !== null);
      if(brushDataSubset.length > 0) {
        const firstTimestamp = brushDataSubset[0]!.timestamp;
        const lastTimestamp = brushDataSubset[brushDataSubset.length - 1]!.timestamp;
        const startIndexInOriginal = allData.findIndex(d => d.timestamp === firstTimestamp);
        const endIndexInOriginal = allData.findIndex(d => d.timestamp === lastTimestamp);
        onBrushChange({startIndex: startIndexInOriginal, endIndex: endIndexInOriginal});
      } else {
        onBrushChange(null);
      }
    }
  }, [onBrushChange, filteredDataWithGaps, data]);
  
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
                data={filteredDataWithGaps}
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
                      const format = (dateRange === '1d') ? 'HH:mm' : 'MMM d';
                      return getFormattedTick(value, format);
                    }}
                    scale="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    interval="preserveStartEnd"
                />
                <YAxis />
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent 
                        indicator="line" 
                        labelFormatter={(value) => {
                           return getFormattedTick(value, "MMM d, yyyy, h:mm:ss a");
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
                        animationDuration={300}
                        connectNulls={false}
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
                  data={data} // Brush should use original data without nulls
                />
            </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
