"use client";

import { Zap, Waves, Thermometer, Battery, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SelectedMetrics } from '@/lib/types';

type ChartControlsProps = {
  availableMetrics: string[];
  selectedMetrics: SelectedMetrics;
  setSelectedMetrics: (metrics: SelectedMetrics) => void;
  timeRange: string;
  setTimeRange: (range: string) => void;
};

const metricIcons: { [key: string]: React.ReactNode } = {
  voltage: <Zap className="h-4 w-4" />,
  current: <Waves className="h-4 w-4" />,
  temperature: <Thermometer className="h-4 w-4" />,
  capacity: <Battery className="h-4 w-4" />,
  soc: <Battery className="h-4 w-4" />,
};

const getMetricIcon = (metric: string) => {
    const lowerMetric = metric.toLowerCase();
    for (const key in metricIcons) {
        if (lowerMetric.includes(key)) {
            return metricIcons[key];
        }
    }
    return <Hash className="h-4 w-4" />;
};


export function ChartControls({
  availableMetrics,
  selectedMetrics,
  setSelectedMetrics,
  timeRange,
  setTimeRange,
}: ChartControlsProps) {
  const handleMetricChange = (metric: string, checked: boolean) => {
    setSelectedMetrics({ ...selectedMetrics, [metric]: checked });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Chart Controls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col md:flex-row gap-6">
        <div className="flex-1">
          <Label className="text-base font-semibold">Metrics</Label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
            {availableMetrics.map((metric) => (
              <div key={metric} className="flex items-center space-x-2">
                <Checkbox
                  id={metric}
                  checked={!!selectedMetrics[metric]}
                  onCheckedChange={(checked) => handleMetricChange(metric, !!checked)}
                />
                <Label
                  htmlFor={metric}
                  className="flex items-center gap-2 font-normal capitalize cursor-pointer"
                >
                  {getMetricIcon(metric)}
                  {metric.replace(/_/g, ' ')}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <Label className="text-base font-semibold">Time Range</Label>
          <Tabs value={timeRange} onValueChange={setTimeRange} className="mt-2">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="1h">1H</TabsTrigger>
              <TabsTrigger value="1d">1D</TabsTrigger>
              <TabsTrigger value="1w">1W</TabsTrigger>
              <TabsTrigger value="1m">1M</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}
