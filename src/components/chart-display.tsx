
"use client";

import { useMemo, useCallback, useState, useRef } from 'react';
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
};

type ZoomState = {
  x1: number | string | null;
  y1: number | string | null;
  x2: number | string | null;
  y2: number | string | null;
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
}: ChartDisplayProps) {

  const [zoomState, setZoomState] = useState<ZoomState>({ x1: null, y1: null, x2: null, y2: null });
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

    const sortedData = [...timeFilteredData].sort((a, b) => a.timestamp - b.timestamp);

    const dataWithGaps: (DataPoint | { timestamp: number, isGap: boolean, [key:string]: any })[] = [];
    const twoHours = 2 * 60 * 60 * 1000;

    for (let i = 0; i < sortedData.length; i++) {
        dataWithGaps.push(sortedData[i]);
        if (i < sortedData.length - 1) {
            const diff = sortedData[i+1].timestamp - sortedData[i].timestamp;
            if (diff > twoHours) {
                const nullPoint = { timestamp: sortedData[i].timestamp + twoHours/2, isGap: true };
                Object.keys(selectedMetrics).forEach(m => nullPoint[m] = null);
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
    setZoomState({ ...zoomState, x1: e.activeLabel, y1: e.activeCoordinate.y, x2: e.activeLabel, y2: e.activeCoordinate.y });
  };

  const handleMouseMove = (e: any) => {
    if (zoomState.x1 && e && e.activeLabel) {
      setZoomState({ ...zoomState, x2: e.activeLabel, y2: e.activeCoordinate.y });
    }
  };

  const handleMouseUp = (e:any) => {
    if (zoomState.x1 && zoomState.x2) {
      const { x1, y1, x2, y2 } = zoomState;

      const yAxis = e.chartY; // The Y-axis pixel position
      const chartHeight = e.chartHeight;

      // This is an approximation. We need to get the domains of the axes.
      // Recharts does not provide a direct way to get the scale function outside of custom components.
      // We will assume a linear scale and approximate the values.
      // This is a simplification. A more accurate solution would involve chart internals.
      const leftYAxis = e.yAxisMap?.left;
      const rightYAxis = e.yAxisMap?.right;

      if (!leftYAxis || !rightYAxis) {
          resetZoom();
          return;
      }
      
      const [yLeftMin, yLeftMax] = leftYAxis.domain;
      const [yRightMin, yRightMax] = rightYAxis.domain;
      
      const yMinPixel = leftYAxis.y; // top of the axis
      const yMaxPixel = leftYAxis.y + leftYAxis.height; // bottom of the axis

      // Normalize pixel coords (0 to 1)
      const y1Norm = (y1 - yMinPixel) / (yMaxPixel - yMinPixel);
      const y2Norm = (y2 - yMinPixel) / (yMaxPixel - yMinPixel);
      
      const yLeft1 = yLeftMax - y1Norm * (yLeftMax - yLeftMin);
      const yLeft2 = yLeftMax - y2Norm * (yLeftMax - yLeftMin);
      const yRight1 = yRightMax - y1Norm * (yRightMax - yRightMin);
      const yRight2 = yRightMax - y2Norm * (yRightMax - yRightMin);
      
      const newDomain: ZoomDomain = {
        x: [Math.min(x1 as number, x2 as number), Math.max(x1 as number, x2 as number)],
        yLeft: [Math.min(yLeft1, yLeft2), Math.max(yLeft1, yLeft2)],
        yRight: [Math.min(yRight1, yRight2), Math.max(yRight1, yRight2)],
      };
      
      if (Math.abs((x1 as number) - (x2 as number)) > 1000) { // only zoom if selection is significant
          setZoomDomain(newDomain);
      }
    }
    setZoomState({ x1: null, y1: null, x2: null, y2: null });
  };

  const resetZoom = () => {
    setZoomDomain(null);
  };


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

  const { x1, x2 } = zoomState;

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
            margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={zoomDomain ? zoomDomain.x : ['dataMin', 'dataMax']}
              tickFormatter={(value) => getFormattedTimestamp(value, visibleRange)}
              interval="preserveStartEnd"
              allowDataOverflow
            />
            <YAxis 
                yAxisId="left" 
                orientation="left" 
                stroke="hsl(var(--foreground))" 
                domain={zoomDomain ? zoomDomain.yLeft : ['auto', 'auto']} 
                allowDataOverflow
            />
            <YAxis 
                yAxisId="right" 
                orientation="right" 
                stroke="hsl(var(--foreground))" 
                domain={zoomDomain ? zoomDomain.yRight : ['auto', 'auto']}
                allowDataOverflow
            />
            
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

            {x1 && x2 ? (
                <ReferenceArea x1={x1} x2={x2} strokeOpacity={0.3} yAxisId="left"/>
            ) : null}

          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
