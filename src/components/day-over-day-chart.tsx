'use client';

import { useState, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Label } from './ui/label';
import type { DataPoint } from '@/lib/types';
import { formatInTimeZone } from 'date-fns-tz';

type DayOverDayChartProps = {
  dataHistory: DataPoint[];
  availableMetrics: string[];
};

const getDayKey = (timestamp: number) => {
    return formatInTimeZone(new Date(timestamp), 'UTC', 'yyyy-MM-dd');
};

const formatDayHeader = (dayKey: string) => {
    const date = new Date(dayKey + 'T00:00:00Z');
    return formatInTimeZone(date, 'UTC', 'MMM d');
}

const formatHour = (hour: number): string => {
    const h = hour % 24;
    const period = h < 12 ? 'AM' : 'PM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour} ${period}`;
};

const formatMetricName = (name: string) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export function DayOverDayChart({ dataHistory, availableMetrics }: DayOverDayChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>(availableMetrics[0] || 'soc');
  const [selectedHour, setSelectedHour] = useState<number>(12);

  const hourlyData = useMemo(() => {
    if (!dataHistory || dataHistory.length === 0) {
      return [];
    }

    const hourlyBuckets: { [day: string]: { [hour: number]: number[] } } = {};
    const days = new Set<string>();

    dataHistory.forEach(dp => {
        const dayKey = getDayKey(dp.timestamp);
        days.add(dayKey);

        const date = new Date(dp.timestamp);
        const hour = date.getUTCHours();
        
        if (dp[selectedMetric] !== undefined && dp[selectedMetric] !== null) {
            if (!hourlyBuckets[dayKey]) hourlyBuckets[dayKey] = {};
            if (!hourlyBuckets[dayKey][hour]) hourlyBuckets[dayKey][hour] = [];
            hourlyBuckets[dayKey][hour].push(dp[selectedMetric]);
        }
    });

    const sortedDays = Array.from(days).sort();
    
    return sortedDays.map(dayKey => {
        const hourValues = hourlyBuckets[dayKey]?.[selectedHour] || [];
        const average = hourValues.length > 0 ? hourValues.reduce((a,b) => a + b, 0) / hourValues.length : 0;
        
        return {
            name: formatDayHeader(dayKey),
            [selectedMetric]: average,
        };
    });

  }, [dataHistory, selectedMetric, selectedHour]);

  if (dataHistory.length < 2) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Day-Over-Day Comparison</CardTitle>
            </CardHeader>
            <CardContent className="flex aspect-video w-full items-center justify-center rounded-lg border-dashed border-2 bg-muted/50">
                <p className="text-muted-foreground text-center">
                  Not enough data for day-over-day comparison. <br/> Please upload data points from at least two different days.
                </p>
            </CardContent>
        </Card>
    );
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle>Day-Over-Day Comparison</CardTitle>
        <CardDescription>
            Comparing the average value of a single metric for a specific hour across different days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="metric-select">Metric</Label>
                <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                    <SelectTrigger id="metric-select">
                        <SelectValue placeholder="Select a metric" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableMetrics.map(metric => (
                            <SelectItem key={metric} value={metric}>
                                {formatMetricName(metric)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="hour-slider">Hour of Day: {formatHour(selectedHour)} - {formatHour(selectedHour+1)}</Label>
                <Slider
                    id="hour-slider"
                    min={0}
                    max={23}
                    step={1}
                    value={[selectedHour]}
                    onValueChange={(value) => setSelectedHour(value[0])}
                />
            </div>
        </div>
        <div className="h-[450px] w-full">
            <ResponsiveContainer>
                <BarChart data={hourlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                        formatter={(value) => typeof value === 'number' ? value.toFixed(3) : value}
                        cursor={{fill: 'hsl(var(--muted))'}}
                    />
                    <Legend />
                    <Bar dataKey={selectedMetric} name={formatMetricName(selectedMetric)} fill="hsl(var(--chart-1))" />
                </BarChart>
            </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
