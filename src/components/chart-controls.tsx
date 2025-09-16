"use client";

import { Zap, Waves, Thermometer, Battery, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { SelectedMetrics } from '@/lib/types';
import { useMemo } from 'react';

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

const standardMetrics = ['soc', 'voltage', 'current', 'capacity', 'temperature'];

const formatMetricName = (name: string) => {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
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

const MetricCheckbox = ({ metric, selectedMetrics, onMetricChange }: { metric: string, selectedMetrics: SelectedMetrics, onMetricChange: (metric: string, checked: boolean) => void }) => (
    <div key={metric} className="flex items-center space-x-2">
        <Checkbox
            id={metric}
            checked={!!selectedMetrics[metric]}
            onCheckedChange={(checked) => onMetricChange(metric, !!checked)}
        />
        <Label
            htmlFor={metric}
            className="flex items-center gap-2 font-normal capitalize cursor-pointer"
        >
            {getMetricIcon(metric)}
            {formatMetricName(metric)}
        </Label>
    </div>
);

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

  const { mainMetrics, extraMetrics } = useMemo(() => {
    const main: string[] = [];
    const extra: string[] = [];
    availableMetrics.forEach(m => {
        const lowerM = m.toLowerCase();
        // Exact matches or if the available metric name contains a standard metric name
        if (standardMetrics.includes(lowerM) || standardMetrics.some(sm => lowerM.includes(sm))) {
            main.push(m);
        } else {
            extra.push(m);
        }
    });
    // Ensure standard metrics that might not have been in the first check are included if available
     const mainSet = new Set(main);
     availableMetrics.forEach(m => {
         if (standardMetrics.includes(m.toLowerCase()) && !mainSet.has(m)) {
             main.push(m);
             mainSet.add(m);
         }
     });
     const finalExtra = extra.filter(m => !mainSet.has(m));

    return { mainMetrics: [...mainSet].sort(), extraMetrics: finalExtra.sort() };
  }, [availableMetrics]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Chart Controls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div>
            <Label className="text-base font-semibold">Metrics</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
              {mainMetrics.map((metric) => (
                <MetricCheckbox key={metric} metric={metric} selectedMetrics={selectedMetrics} onMetricChange={handleMetricChange} />
              ))}
            </div>
          </div>
          {extraMetrics.length > 0 && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Extra extracted metrics</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                    {extraMetrics.map((metric) => (
                      <MetricCheckbox key={metric} metric={metric} selectedMetrics={selectedMetrics} onMetricChange={handleMetricChange} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
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
