
"use client";

import { useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataPoint, ChartInfo, SelectedMetrics } from '@/lib/types';
import { subDays, subWeeks, subMonths } from 'date-fns';
import { BatteryTrendChart } from './BatteryTrendChart';

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

// More than 2 hours is considered a significant gap
const TIME_GAP_THRESHOLD = 2 * 60 * 60 * 1000; 

export function ChartDisplay({
  batteryId,
  data,
  selectedMetrics,
  dateRange,
  chartInfo,
  isLoading,
  onBrushChange,
}: ChartDisplayProps) {

  const activeMetrics = useMemo(() => Object.keys(selectedMetrics).filter(k => selectedMetrics[k as keyof SelectedMetrics]), [selectedMetrics]);

  const { processedData, brushFriendlyData } = useMemo(() => {
    if (!data || data.length === 0) return { processedData: [], brushFriendlyData: [] };
    
    const now = new Date();
    // 1. Filter data based on the selected date range
    const timeFilteredData = data.filter(d => {
        if (d.timestamp === null || d.timestamp === undefined) return false;
        switch (dateRange) {
            case '1d': return d.timestamp >= subDays(now, 1).getTime();
            case '1w': return d.timestamp >= subWeeks(now, 1).getTime();
            case '1m': return d.timestamp >= subMonths(now, 1).getTime();
            default: return true;
        }
    });
    
    if (timeFilteredData.length < 1) {
      return { processedData: [], brushFriendlyData: [] };
    }

    // 2. Sort the data chronologically. This is a critical step.
    const sortedData = [...timeFilteredData].sort((a, b) => a.timestamp - b.timestamp);
    
    // 3. Create a clean dataset for the brush component (no nulls).
    const brushData = [...sortedData];

    // 4. Insert nulls for time gaps to create visual breaks in the line chart.
    const dataWithGaps: DataPoint[] = [];
    if (sortedData.length > 0) {
        dataWithGaps.push(sortedData[0]);
        for (let i = 1; i < sortedData.length; i++) {
            const prevPoint = sortedData[i - 1];
            const currentPoint = sortedData[i];
            
            if (currentPoint.timestamp - prevPoint.timestamp > TIME_GAP_THRESHOLD) {
                // Insert a point with null values to create a gap in the line
                const gapPoint: DataPoint = { timestamp: prevPoint.timestamp + (TIME_GAP_THRESHOLD / 2) };
                activeMetrics.forEach(metric => {
                    gapPoint[metric] = null;
                });
                dataWithGaps.push(gapPoint);
            }
            dataWithGaps.push(currentPoint);
        }
    }
    
    return { processedData: dataWithGaps, brushFriendlyData: brushData };
  }, [data, dateRange, activeMetrics]);
  
  const handleBrushChangeCallback = useCallback((range: { startIndex?: number, endIndex?: number } | undefined) => {
    if (range?.startIndex === undefined || range?.endIndex === undefined) {
      onBrushChange(null);
      return;
    }
    
    // The brush gives indices relative to its own data (brushFriendlyData)
    // We need to find the corresponding timestamps
    const startTimestamp = brushFriendlyData[range.startIndex]?.timestamp;
    const endTimestamp = brushFriendlyData[range.endIndex]?.timestamp;
    
    if (startTimestamp === undefined || endTimestamp === undefined) {
      onBrushChange(null);
      return;
    }

    // Now, find the indices in the original, unfiltered `data` array to update the stats card
    const startIndexInOriginal = data.findIndex(d => d.timestamp >= startTimestamp);
    let endIndexInOriginal = -1;
    for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].timestamp <= endTimestamp) {
            endIndexInOriginal = i;
            break;
        }
    }
      
    if(startIndexInOriginal !== -1 && endIndexInOriginal !== -1) {
        onBrushChange({startIndex: startIndexInOriginal, endIndex: endIndexInOriginal});
    } else {
        onBrushChange(null);
    }
  }, [onBrushChange, brushFriendlyData, data]);

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

  if (!batteryId || processedData.length === 0) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Trend Chart</CardTitle>
                <CardDescription>Your data visualization will appear here.</CardDescription>
            </CardHeader>
            <CardContent className="flex aspect-video w-full items-center justify-center rounded-lg border-dashed border-2 bg-muted/50">
                <p className="text-muted-foreground">
                  { !batteryId ? "Select a battery to view its chart." : "No data to display for the selected range." }
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
        <BatteryTrendChart
            processedData={processedData}
            brushData={brushFriendlyData}
            selectedMetrics={selectedMetrics}
            onBrushChange={handleBrushChangeCallback}
        />
      </CardContent>
    </Card>
  );
}
