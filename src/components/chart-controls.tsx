"use client";

import { Zap, Waves, Thermometer, Battery, Hash, LineChart, BarChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { SelectedMetrics } from '@/lib/types';
import { useMemo } from 'react';
import { Switch } from './ui/switch';

type ChartControlsProps = {
  availableMetrics: string[];
  selectedMetrics: SelectedMetrics;
  setSelectedMetrics: (metrics: SelectedMetrics) => void;
  dateRange: string;
  setDateRange: (range: string) => void;
  hasData: boolean;
  chartMode: 'trend' | 'day-over-day';
  setChartMode: (mode: 'trend' | 'day-over-day') => void;
};

const metricIcons: { [key: string]: React.ReactNode } = {
  voltage: <Zap className="h-4 w-4" />,
  current: <Waves className="h-4 w-4" />,
  temperature: <Thermometer className="h-4 w-4" />,
  capacity: <Battery className="h-4 w-4" />,
  soc: <Battery className="h-4 w-4" />,
};

const coreMetrics = ['soc', 'voltage', 'current', 'capacity', 'temperature'];

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
  hasData,
  chartMode,
  setChartMode,
}: ChartControlsProps) {
  const handleMetricChange = (metric: string, checked: boolean) => {
    setSelectedMetrics({ ...selectedMetrics, [metric]: checked });
  };

  const { mainMetrics, extraMetrics } = useMemo(() => {
    const allMetrics = new Set(availableMetrics);
    
    const main = new Set<string>();
    const extra = new Set<string>();
    
    coreMetrics.forEach(cm => {
        if(allMetrics.has(cm)) main.add(cm);
    })

    allMetrics.forEach(m => {
        if (!coreMetrics.includes(m)) {
            extra.add(m);
        }
    });

    return { mainMetrics: Array.from(main).sort(), extraMetrics: Array.from(extra).sort() };
  }, [availableMetrics]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Chart Controls</CardTitle>
            <div className="flex items-center space-x-2">
                <LineChart className={`h-5 w-5 ${chartMode === 'trend' ? 'text-primary' : 'text-muted-foreground'}`} />
                <Switch
                    checked={chartMode === 'day-over-day'}
                    onCheckedChange={(checked) => setChartMode(checked ? 'day-over-day' : 'trend')}
                    id="chart-mode-switch"
                    aria-label="Toggle between Trend and Day-over-day chart modes"
                />
                <BarChart className={`h-5 w-5 ${chartMode === 'day-over-day' ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {chartMode === 'trend' ? (
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
        ) : (
            <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                    This shows aggregated hourly statistics across all available data.
                </p>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

    