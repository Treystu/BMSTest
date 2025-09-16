"use client";

import { Zap, Waves, Thermometer, Battery, Hash, Wand2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { SelectedMetrics } from '@/lib/types';
import { useMemo } from 'react';
import { Separator } from './ui/separator';

type ChartControlsProps = {
  availableMetrics: string[];
  selectedMetrics: SelectedMetrics;
  setSelectedMetrics: (metrics: SelectedMetrics) => void;
  dateRange: string;
  setDateRange: (range: string) => void;
  onGenerateSummary: () => void;
  isGeneratingSummary: boolean;
  hasData: boolean;
};

const metricIcons: { [key: string]: React.ReactNode } = {
  voltage: <Zap className="h-4 w-4" />,
  current: <Waves className="h-4 w-4" />,
  temperature: <Thermometer className="h-4 w-4" />,
  capacity: <Battery className="h-4 w-4" />,
  soc: <Battery className="h-4 w-4" />,
};

const coreMetrics = ['soc', 'voltage', 'current', 'capacity'];

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
  dateRange,
  setDateRange,
  onGenerateSummary,
  isGeneratingSummary,
  hasData,
}: ChartControlsProps) {
  const handleMetricChange = (metric: string, checked: boolean) => {
    setSelectedMetrics({ ...selectedMetrics, [metric]: checked });
  };

  const { mainMetrics, extraMetrics } = useMemo(() => {
    const main = new Set<string>();
    const extra = new Set<string>();
    
    availableMetrics.forEach(m => {
        if (coreMetrics.includes(m)) {
            main.add(m);
        } else {
            extra.add(m);
        }
    });

    // Ensure core metrics are always available for selection even if not in data yet
    coreMetrics.forEach(cm => main.add(cm));


    return { mainMetrics: Array.from(main).sort(), extraMetrics: Array.from(extra).sort() };
  }, [availableMetrics]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chart Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col md:flex-row gap-6">
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
                    <AccordionTrigger>Extra Metrics</AccordionTrigger>
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
            <Label className="text-base font-semibold">Date Range</Label>
            <Tabs value={dateRange} onValueChange={setDateRange} className="mt-2">
                <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="1d">Last Day</TabsTrigger>
                <TabsTrigger value="1w">Last Week</TabsTrigger>
                <TabsTrigger value="1m">Last Month</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
            </Tabs>
            </div>
        </div>
        <Separator />
        <div>
            <Label className="text-base font-semibold">AI Actions</Label>
            <div className="mt-2">
                <Button onClick={onGenerateSummary} disabled={isGeneratingSummary || !hasData}>
                    {isGeneratingSummary ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                    )}
                    Generate AI Summary
                </Button>
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
