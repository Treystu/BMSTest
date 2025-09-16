
"use client";

import { useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataPoint, ChartInfo, SelectedMetrics, ProcessedDataPoint } from '@/lib/types';
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

const TIME_GAP_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours

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
    
    // 1. Filter by Date Range
    const now = new Date();
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

    // 2. Critically: Sort by timestamp
    const sortedData = [...timeFilteredData].sort((a, b) => a.timestamp - b.timestamp);
    
    // 3. Create a clean dataset for the brush (no gaps)
    const brushData = [...sortedData]; 
    
    // 4. Insert nulls for time gaps
    const finalDataWithGaps: ProcessedDataPoint[] = [];
    if (sortedData.length > 0) {
      finalDataWithGaps.push(sortedData[0]);
      for (let i = 1; i < sortedData.length; i++) {
        const prevPoint = sortedData[i-1];
        const currentPoint = sortedData[i];
        
        if (currentPoint.timestamp - prevPoint.timestamp > TIME_GAP_THRESHOLD) {
          // Insert a gap point with null values
          const gapPoint: ProcessedDataPoint = {
            timestamp: prevPoint.timestamp + (TIME_GAP_THRESHOLD / 4), // Position gap point after previous point
            type: 'single' // or any other appropriate type
          };
          activeMetrics.forEach(metric => {
            gapPoint[metric] = null;
          });
          finalDataWithGaps.push(gapPoint);
        }
        
        finalDataWithGaps.push(currentPoint);
      }
    }


    return { processedData: finalDataWithGaps, brushFriendlyData: brushData };
  }, [data, dateRange, activeMetrics]);
  
  const handleBrushChangeCallback = useCallback((range: { startIndex?: number, endIndex?: number } | undefined) => {
    if (range?.startIndex === undefined || range?.endIndex === undefined) {
      onBrushChange(null);
      return;
    }
    
    const startTimestamp = brushFriendlyData[range.startIndex]?.timestamp;
    const endTimestamp = brushFriendlyData[range.endIndex]?.timestamp;
    
    if (startTimestamp === undefined || endTimestamp === undefined) {
      onBrushChange(null);
      return;
    }

    // Find the corresponding indices in the original, unsorted `data` array
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
