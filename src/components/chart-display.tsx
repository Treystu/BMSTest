"use client";

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataPoint, ChartInfo, SelectedMetrics } from '@/lib/types';
import { subHours, subDays, subWeeks, subMonths, format } from 'date-fns';

type ChartDisplayProps = {
  data: DataPoint[];
  selectedMetrics: SelectedMetrics;
  timeRange: string;
  chartInfo: ChartInfo | null;
  isLoading: boolean;
};

const lineColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function ChartDisplay({
  data,
  selectedMetrics,
  timeRange,
  chartInfo,
  isLoading,
}: ChartDisplayProps) {

  const filteredData = useMemo(() => {
    if (timeRange === 'all') return data;
    const now = Date.now();
    let startTime: number;

    switch (timeRange) {
      case '1h':
        startTime = subHours(now, 1).getTime();
        break;
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
        return data;
    }
    return data.filter(d => d.timestamp >= startTime);
  }, [data, timeRange]);
  
  const activeMetrics = useMemo(() => Object.keys(selectedMetrics).filter(k => selectedMetrics[k]), [selectedMetrics]);
  
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

  if (data.length === 0) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>4. Trend Chart</CardTitle>
                <CardDescription>Your data visualization will appear here.</CardDescription>
            </CardHeader>
            <CardContent className="flex aspect-video w-full items-center justify-center rounded-lg border-dashed border-2 bg-muted/50">
                <p className="text-muted-foreground">No data to display yet.</p>
            </CardContent>
        </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{chartInfo?.title || 'Trend Chart'}</CardTitle>
        <CardDescription>
          {chartInfo?.description || 'Time-based trend of extracted metrics.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
            <LineChart
                accessibilityLayer
                data={filteredData}
                margin={{
                  top: 5,
                  right: 10,
                  left: 10,
                  bottom: 5,
                }}
            >
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      if (timeRange === '1h' || timeRange === '1d') {
                        return format(date, 'HH:mm');
                      }
                      return format(date, 'MMM d');
                    }}
                    scale="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                />
                <YAxis />
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="line" />}
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
                    />
                ))}
            </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
