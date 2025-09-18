
'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import type { DataPoint } from '@/lib/types';
import { useState } from 'react';

type DayOverDayChartProps = {
  dataHistory: DataPoint[];
  availableMetrics: string[];
};

type HourlyStat = {
  hour: number;
  name: string;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  q1: number;
  q3: number;
  count: number;
};

const formatHour = (hour: number): string => {
  const h = hour % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour} ${period}`;
};

const formatMetricName = (name: string) => {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as HourlyStat;
    return (
      <div className="p-2 bg-background border rounded-md shadow-lg text-sm">
        <p className="font-bold">{label}</p>
        <p>Mean: {data.mean.toFixed(3)}</p>
        <p>Median: {data.median.toFixed(3)}</p>
        <p>Min: {data.min.toFixed(3)}</p>
        <p>Max: {data.max.toFixed(3)}</p>
        <p>Std Dev: {data.stdDev.toFixed(3)}</p>
        <p>Data Points: {data.count}</p>
      </div>
    );
  }
  return null;
};

// Custom component to render the median line inside the bar
const MedianLine = (props: any) => {
    const { x, y, width, height, payload } = props;
    const { mean, median } = payload;
    
    // Only render if there's a visual difference to avoid clutter
    if (Math.abs(mean - median) < 0.01 * Math.abs(mean)) return null;

    // The y prop from recharts is the top of the bar for positive values.
    // The median value needs to be scaled to the Y-axis.
    // This requires access to the scale function, which is tricky here.
    // A simpler approximation: show it relative to the bar's height.
    // This is not perfectly accurate but gives a visual cue.
    const yAxis = props.yAxis;
    const medianY = yAxis.scale(median);

    if (medianY < y || medianY > y + height) return null;

    return <line x1={x} y1={medianY} x2={x + width} stroke="hsl(var(--destructive))" strokeWidth={2} />;
};


export function DayOverDayChart({ dataHistory, availableMetrics }: DayOverDayChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>(availableMetrics.includes('soc') ? 'soc' : availableMetrics[0] || '');

  const hourlyStats: HourlyStat[] = useMemo(() => {
    if (!selectedMetric || dataHistory.length === 0) {
      return [];
    }

    const hourlyBuckets: { [hour: number]: number[] } = Array.from({ length: 24 }, () => []);

    dataHistory.forEach((dp) => {
      const metricValue = dp[selectedMetric];
      if (metricValue !== undefined && metricValue !== null) {
        const date = new Date(dp.timestamp);
        const hour = date.getUTCHours();
        hourlyBuckets[hour].push(Number(metricValue));
      }
    });

    return hourlyBuckets.map((values, hour) => {
      if (values.length === 0) {
        return { hour, name: formatHour(hour), min: 0, max: 0, mean: 0, median: 0, stdDev: 0, q1: 0, q3: 0, count: 0 };
      }

      values.sort((a, b) => a - b);
      const min = values[0];
      const max = values[values.length - 1];
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      
      const mid = Math.floor(values.length / 2);
      const median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
      
      const q1Index = Math.floor(values.length / 4);
      const q3Index = Math.floor(values.length * 3 / 4);
      const q1 = values.length > 1 ? (values.length % 4 === 0 ? (values[q1Index-1] + values[q1Index])/2 : values[q1Index]) : values[0];
      const q3 = values.length > 1 ? (values.length % 4 === 0 ? (values[q3Index-1] + values[q3Index])/2 : values[q3Index]) : values[0];


      const stdDev = Math.sqrt(values.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / values.length);

      return { hour, name: formatHour(hour), min, max, mean, median, stdDev, q1, q3, count: values.length };
    }).filter(stat => stat.count > 0); // Only show hours with data

  }, [dataHistory, selectedMetric]);

  if (dataHistory.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hour-over-Hour Analysis</CardTitle>
        </CardHeader>
        <CardContent className="flex aspect-video w-full items-center justify-center rounded-lg border-dashed border-2 bg-muted/50">
          <p className="text-muted-foreground text-center">
            Not enough data for hourly analysis. <br /> Please upload more data points.
          </p>
        </CardContent>
      </Card>
    );
  }

  const yDomain = useMemo(() => {
    if (hourlyStats.length === 0) return ['auto', 'auto'];
    const allValues = hourlyStats.flatMap(s => [s.min, s.max, s.mean]);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.1;
    return [min - padding, max + padding];
  }, [hourlyStats]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hour-over-Hour Statistical Analysis</CardTitle>
        <CardDescription>
          Aggregated statistics for each hour of the day across all available data. This shows what a "normal" hour looks like.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-xs space-y-2">
          <Label htmlFor="metric-select">Metric</Label>
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger id="metric-select">
              <SelectValue placeholder="Select a metric" />
            </SelectTrigger>
            <SelectContent>
              {availableMetrics.map((metric) => (
                <SelectItem key={metric} value={metric}>
                  {formatMetricName(metric)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-[450px] w-full">
          <ResponsiveContainer>
            <ComposedChart data={hourlyStats} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis domain={yDomain} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              <Bar
                key="range-bar"
                dataKey={(payload) => payload.max - payload.min}
                name="Min-Max Range"
                fill="hsl(var(--chart-2))"
                opacity={0.3}
                barSize={30}
                stackId="a"
              />
              
              <Line 
                key="mean-line"
                type="monotone"
                dataKey="mean"
                name="Mean"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={{r: 4}}
                activeDot={{r: 6}}
              />

              <Line
                key="median-line"
                type="monotone"
                dataKey="median"
                name="Median"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
