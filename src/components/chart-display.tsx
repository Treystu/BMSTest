
"use client";

import { useMemo, useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { DataPoint, ChartInfo, SelectedMetrics } from '@/lib/types';
import { subDays, subWeeks, subMonths } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea
} from 'recharts';

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

type ZoomState = {
  x1: number | string | null;
  y1: number | string | null;
  x2: number | string | null;
  y2: number | string | null;
  refAreaLeft: string | number;
  refAreaRight: string | number;
};

type ZoomDomain = {
  x: [number, number];
  yLeft: [number, number];
  yRight: [number, number];
};

const lineColors: { [key: string]: string } = {
  soc: "hsl(var(--chart-1))",
  voltage: "hsl(var(--chart-2))",
  current: "hsl(var(--chart-3))",
  capacity: "hsl(var(--chart-4))",
  temperature: "hsl(var(--chart-5))",
};

const getLineColor = (metric: string): string => {
    if (lineColors[metric]) {
        return lineColors[metric];
    }
    // Fallback for custom metrics
    let hash = 0;
    for (let i = 0; i < metric.length; i++) {
        hash = metric.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, 70%, 50%)`;
};

const leftAxisMetricSet = new Set(['soc', 'capacity']);

const getFormattedTimestamp = (ts: number, rangeInMs: number) => {
    if (isNaN(ts)) return "";
    try {
        const oneDay = 24 * 60 * 60 * 1000;
        const formatStr = rangeInMs <= oneDay * 2 ? 'HH:mm' : 'MMM d';
        return formatInTimeZone(new Date(ts), 'UTC', formatStr);
    } catch (e) {
        return "";
    }
};

const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const point = payload[0].payload;
        if(point.isGap){
          return null;
        }

        return (
            <div className="p-3 bg-background border rounded-lg shadow-xl text-sm space-y-2">
                <p className="font-bold">{formatInTimeZone(new Date(label), 'UTC', "MMM d, yyyy, h:mm:ss a")}</p>
                {payload.map((p: any) => (
                    p.value !== null && p.value !== undefined && (
                        <div key={p.dataKey} style={{ color: p.color }} className="flex justify-between items-center">
                            <p className="capitalize font-semibold">{p.dataKey.replace(/_/g, ' ')}:</p>
                            <p className="font-mono ml-4">{p.value?.toFixed(3)}</p>
                        </div>
                    )
                ))}
            </div>
        );
    }
    return null;
};


export function ChartDisplay({
  batteryId,
  data,
  selectedMetrics,
  dateRange,
  chartInfo,
  isLoading,
  onBrushChange
}: ChartDisplayProps) {

  const [zoomState, setZoomState] = useState<ZoomState>({ x1: null, y1: null, x2: null, y2: null, refAreaLeft: '', refAreaRight: '' });
  const [zoomDomain, setZoomDomain] = useState<ZoomDomain | null>(null);

  const { processedData, visibleRange } = useMemo(() => {
    if (!data || data.length === 0) return { processedData: [], visibleRange: 0 };
    
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

    if (timeFilteredData.length === 0) return { processedData: [], visibleRange: 0 };
    
    // CRITICAL: Sort data chronologically before any other processing.
    const sortedData = [...timeFilteredData].sort((a, b) => a.timestamp - b.timestamp);

    const dataWithGaps: (DataPoint | { timestamp: number, isGap: boolean, [key:string]: any })[] = [];
    const twoHours = 2 * 60 * 60 * 1000;

    for (let i = 0; i < sortedData.length; i++) {
        dataWithGaps.push(sortedData[i]);
        if (i < sortedData.length - 1) {
            const diff = sortedData[i+1].timestamp - sortedData[i].timestamp;
            if (diff > twoHours) {
                // Insert a point with null values to create a visual gap
                const nullPoint = { timestamp: sortedData[i].timestamp + twoHours/2, isGap: true };
                Object.keys(selectedMetrics).forEach(m => {
                  if(selectedMetrics[m as keyof typeof selectedMetrics]) {
                    nullPoint[m] = null
                  }
                });
                dataWithGaps.push(nullPoint);
            }
        }
    }
    
    const first = sortedData[0]?.timestamp || 0;
    const last = sortedData[sortedData.length - 1]?.timestamp || 0;
    
    return { processedData: dataWithGaps, visibleRange: last - first };

  }, [data, dateRange, selectedMetrics]);
  
  const { leftMetrics, rightMetrics } = useMemo(() => {
    const left: string[] = [];
    const right: string[] = [];
    
    Object.keys(selectedMetrics).forEach(metric => {
        if (selectedMetrics[metric as keyof SelectedMetrics]) {
            if (leftAxisMetricSet.has(metric)) {
                left.push(metric);
            } else {
                right.push(metric);
            }
        }
    });

    return { leftMetrics: left, rightMetrics: right };
  }, [selectedMetrics]);

  const handleMouseDown = (e: any) => {
    if (!e || !e.activeLabel) return;
    setZoomState({ ...zoomState, refAreaLeft: e.activeLabel, refAreaRight: e.activeLabel, x1: e.activeCoordinate.x, y1: e.activeCoordinate.y });
  };

  const handleMouseMove = (e: any) => {
    if (zoomState.refAreaLeft && e && e.activeLabel) {
      setZoomState({ ...zoomState, refAreaRight: e.activeLabel, x2: e.activeCoordinate.x, y2: e.activeCoordinate.y });
    }
  };

  const handleMouseUp = (e: any) => {
    const { refAreaLeft, refAreaRight } = zoomState;
    if (refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight) {
        
      const leftNum = typeof refAreaLeft === 'string' ? parseFloat(refAreaLeft) : refAreaLeft;
      const rightNum = typeof refAreaRight === 'string' ? parseFloat(refAreaRight) : refAreaRight;
      
      const newDomainX: [number, number] = [Math.min(leftNum, rightNum), Math.max(leftNum, rightNum)];

      const leftYAxis = e.yAxisMap?.left;
      const rightYAxis = e.yAxisMap?.right;
      
      // Ensure both axes are available before calculating Y domain
      if (!leftYAxis && !rightYAxis) {
          resetZoom();
          return;
      }
      
      const { y1, y2 } = zoomState;
      const yMinPixel = (leftYAxis || rightYAxis).y; // top of the axis
      const yMaxPixel = yMinPixel + (leftYAxis || rightYAxis).height; // bottom of the axis

      // Normalize pixel coords (0 to 1) from top to bottom
      const y1Norm = ((y1 as number) - yMinPixel) / (yMaxPixel - yMinPixel);
      const y2Norm = ((y2 as number) - yMinPixel) / (yMaxPixel - yMinPixel);

      let newDomainYLeft: [number, number] = ['auto', 'auto'] as any;
      let newDomainYRight: [number, number] = ['auto', 'auto'] as any;
      
      if (leftYAxis) {
        const [yLeftMinDom, yLeftMaxDom] = leftYAxis.domain;
        const yLeft1 = yLeftMaxDom - y1Norm * (yLeftMaxDom - yLeftMinDom);
        const yLeft2 = yLeftMaxDom - y2Norm * (yLeftMaxDom - yLeftMinDom);
        newDomainYLeft = [Math.min(yLeft1, yLeft2), Math.max(yLeft1, yLeft2)];
      }

      if (rightYAxis) {
        const [yRightMinDom, yRightMaxDom] = rightYAxis.domain;
        const yRight1 = yRightMaxDom - y1Norm * (yRightMaxDom - yRightMinDom);
        const yRight2 = yRightMaxDom - y2Norm * (yRightMaxDom - yRightMinDom);
        newDomainYRight = [Math.min(yRight1, yRight2), Math.max(yRight1, yRight2)];
      }
      
      setZoomDomain({ x: newDomainX, yLeft: newDomainYLeft, yRight: newDomainYRight });
    }
    // Reset selection rectangle
    setZoomState({ x1: null, y1: null, x2: null, y2: null, refAreaLeft: '', refAreaRight: '' });
  };
  
  const resetZoom = () => {
    setZoomDomain(null);
  };
  
  const handleBrushChangeCallback = useCallback((range: any) => {
    if (range) {
        onBrushChange({ startIndex: range.startIndex, endIndex: range.endIndex });
    }
  }, [onBrushChange]);


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

  if (!batteryId || processedData.length < 2) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Trend Chart</CardTitle>
                <CardDescription>Your data visualization will appear here.</CardDescription>
            </CardHeader>
            <CardContent className="flex aspect-video w-full items-center justify-center rounded-lg border-dashed border-2 bg-muted/50">
                <p className="text-muted-foreground">
                  { !batteryId ? "Select a battery to view its chart." : "Not enough data to display for the selected range." }
                </p>
            </CardContent>
        </Card>
    )
  }

  const { refAreaLeft, refAreaRight } = zoomState;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <div>
                <CardTitle>{chartInfo?.title || `Trends for ${batteryId}`}</CardTitle>
                <CardDescription>
                {chartInfo?.description || 'Click and drag to zoom. Time-based trend of extracted metrics.'}
                </CardDescription>
            </div>
            {zoomDomain && <Button onClick={resetZoom}>Reset Zoom</Button>}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={450}>
          <LineChart 
            data={processedData} 
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              allowDataOverflow
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={zoomDomain ? zoomDomain.x : ['dataMin', 'dataMax']}
              tickFormatter={(value) => getFormattedTimestamp(value, visibleRange)}
              interval="preserveStartEnd"
            />
            {leftMetrics.length > 0 && <YAxis 
                allowDataOverflow
                yAxisId="left" 
                orientation="left" 
                stroke="hsl(var(--foreground))" 
                domain={zoomDomain ? zoomDomain.yLeft : ['auto', 'auto']} 
            />}
            {rightMetrics.length > 0 && <YAxis 
                allowDataOverflow
                yAxisId="right" 
                orientation="right" 
                stroke="hsl(var(--foreground))" 
                domain={zoomDomain ? zoomDomain.yRight : ['auto', 'auto']}
            />}
            
            <Tooltip content={<CustomTooltipContent />} />
            <Legend />
            
            {leftMetrics.map((metric) => (
              <Line
                key={metric}
                yAxisId="left"
                type="monotone"
                dataKey={metric}
                stroke={getLineColor(metric)}
                dot={false}
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={!zoomDomain}
              />
            ))}
            
            {rightMetrics.map((metric) => (
              <Line
                key={metric}
                yAxisId="right"
                type="monotone"
                dataKey={metric}
                stroke={getLineColor(metric)}
                dot={false}
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={!zoomDomain}
              />
            ))}

            {refAreaLeft && refAreaRight ? (
                <ReferenceArea 
                    yAxisId="left" 
                    x1={refAreaLeft} 
                    x2={refAreaRight} 
                    strokeOpacity={0.3} 
                />
            ) : null}

          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
