
"use client";

import { useMemo, useCallback, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { DataPoint, ChartInfo, SelectedMetrics } from '@/lib/types';
import { subDays, subWeeks, subMonths } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, Brush
} from 'recharts';

export type VisibleRange = {
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
  onVisibleRangeChange: (range: VisibleRange | null, isZoomed: boolean) => void;
};

type ZoomState = {
  refAreaLeft: string | number;
  refAreaRight: string | number;
};

type ZoomDomain = {
  x: [number, number];
  yLeft: [any, any];
  yRight: [any, any];
};

const lineColors: { [key: string]: string } = {
  soc: "hsl(var(--chart-1))",
  voltage: "hsl(var(--chart-2))",
  current: "hsl(var(--chart-3))",
  capacity: "hsl(var(--chart-4))",
  temperature: "hsl(var(--chart-5))",
};

const getLineColor = (metric: string): string => {
    const lowerMetric = metric.toLowerCase();
    for (const key in lineColors) {
        if (lowerMetric.includes(key)) {
            return lineColors[key];
        }
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
  onVisibleRangeChange
}: ChartDisplayProps) {

  const [zoomState, setZoomState] = useState<ZoomState>({ refAreaLeft: '', refAreaRight: '' });
  const [zoomDomain, setZoomDomain] = useState<ZoomDomain | null>(null);

  const { leftMetrics, rightMetrics, allMetrics } = useMemo(() => {
    const left: string[] = [];
    const right: string[] = [];
    const all: string[] = [];
    
    Object.keys(selectedMetrics).forEach(metric => {
        if (selectedMetrics[metric as keyof SelectedMetrics]) {
            all.push(metric);
            if (leftAxisMetricSet.has(metric)) {
                left.push(metric);
            } else {
                right.push(metric);
            }
        }
    });

    return { leftMetrics: left, rightMetrics: right, allMetrics: all };
  }, [selectedMetrics]);

  const { timeFilteredData, visibleRange } = useMemo(() => {
    if (!data || data.length === 0) return { timeFilteredData: [], visibleRange: 0 };
    
    const lastDataPointTime = data[data.length - 1]?.timestamp;
    if (!lastDataPointTime) return { timeFilteredData: [], visibleRange: 0 };

    let filtered;
    switch (dateRange) {
        case '1d':
            filtered = data.filter(d => d.timestamp >= subDays(lastDataPointTime, 1).getTime());
            break;
        case '1w':
            filtered = data.filter(d => d.timestamp >= subWeeks(lastDataPointTime, 1).getTime());
            break;
        case '1m':
            filtered = data.filter(d => d.timestamp >= subMonths(lastDataPointTime, 1).getTime());
            break;
        default: // 'all'
            filtered = data;
            break;
    }

    if (filtered.length === 0) return { timeFilteredData: [], visibleRange: 0 };
    
    const first = filtered[0]?.timestamp || 0;
    const last = filtered[filtered.length - 1]?.timestamp || 0;
    
    return { timeFilteredData: filtered, visibleRange: last - first };

  }, [data, dateRange]);

  useEffect(() => {
      // Reset zoom when data or date range changes
      resetZoom();
  }, [timeFilteredData, dateRange]);
  
  const handleMouseDown = (e: any) => {
    if (!e || !e.activeLabel) return;
    setZoomState({ ...zoomState, refAreaLeft: e.activeLabel });
  };

  const handleMouseMove = (e: any) => {
    if (zoomState.refAreaLeft && e && e.activeLabel) {
      setZoomState({ ...zoomState, refAreaRight: e.activeLabel });
    }
  };

  const handleMouseUp = () => {
    const { refAreaLeft, refAreaRight } = zoomState;
    if (refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight) {
      const [from, to] = [refAreaLeft, refAreaRight].sort((a,b) => Number(a)-Number(b));
      
      const newDomainX: [number, number] = [Number(from), Number(to)];
      
      const dataInZoom = timeFilteredData.filter(d => d.timestamp >= newDomainX[0] && d.timestamp <= newDomainX[1]);

      const getPaddedDomain = (metrics: string[]): [number, number] => {
          let min = Infinity;
          let max = -Infinity;
          
          dataInZoom.forEach(dp => {
              metrics.forEach(metric => {
                  const val = dp[metric];
                  if (typeof val === 'number') {
                      if (val < min) min = val;
                      if (val > max) max = val;
                  }
              });
          });

          if (min === Infinity || max === -Infinity) return ['auto', 'auto'];

          const diff = max - min;
          const padding = diff === 0 ? 0.5 : diff * 0.1; // Add padding
          
          return [min - padding, max + padding];
      };

      const yLeftDomain = getPaddedDomain(leftMetrics);
      const yRightDomain = getPaddedDomain(rightMetrics);
      
      setZoomDomain({ 
          x: newDomainX,
          yLeft: yLeftDomain,
          yRight: yRightDomain,
      });

      const startIndex = timeFilteredData.findIndex(d => d.timestamp >= newDomainX[0]);
      const endIndex = timeFilteredData.findLastIndex(d => d.timestamp <= newDomainX[1]);
      onVisibleRangeChange({ startIndex, endIndex }, true);
    }
    setZoomState({ refAreaLeft: '', refAreaRight: '' });
  };
  
  const resetZoom = useCallback(() => {
    setZoomDomain(null);
    onVisibleRangeChange(null, false);
  }, [onVisibleRangeChange]);


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

  if (!batteryId || timeFilteredData.length < 2) {
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
          <ComposedChart 
            data={timeFilteredData} 
            margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
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
                width={80}
            />}
            {rightMetrics.length > 0 && <YAxis 
                allowDataOverflow
                yAxisId="right" 
                orientation="right" 
                stroke="hsl(var(--foreground))" 
                domain={zoomDomain ? zoomDomain.yRight : ['auto', 'auto']}
                width={80}
            />}
            
            <Tooltip content={<CustomTooltipContent />} />
            <Legend wrapperStyle={{ bottom: 25, left: 20 }}/>
            
            {leftMetrics.map((metric) => {
              const color = getLineColor(metric);
              return (
                <React.Fragment key={metric}>
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey={metric}
                    fill={color}
                    stroke={color}
                    fillOpacity={0.2}
                    strokeWidth={0}
                    connectNulls={true}
                    isAnimationActive={!zoomDomain}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey={metric}
                    stroke={color}
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={true}
                    isAnimationActive={!zoomDomain}
                  />
                </React.Fragment>
            )})}
            
            {rightMetrics.map((metric) => {
              const color = getLineColor(metric);
              return (
                <React.Fragment key={metric}>
                   <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey={metric}
                    fill={color}
                    stroke={color}
                    fillOpacity={0.2}
                    strokeWidth={0}
                    connectNulls={true}
                    isAnimationActive={!zoomDomain}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey={metric}
                    stroke={color}
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={true}
                    isAnimationActive={!zoomDomain}
                  />
                </React.Fragment>
            )})}

            {refAreaLeft && refAreaRight ? (
                <ReferenceArea 
                    yAxisId="left" 
                    x1={refAreaLeft} 
                    x2={refAreaRight} 
                    strokeOpacity={0.3} 
                />
            ) : null}

            <Brush 
              dataKey="timestamp" 
              height={30} 
              stroke="hsl(var(--primary))"
              tickFormatter={(value) => getFormattedTimestamp(value, visibleRange)}
              data={timeFilteredData}
            >
                <ComposedChart>
                  {allMetrics.map((metric) => (
                    <Line 
                      key={`${metric}-brush`}
                      type="monotone"
                      dataKey={metric}
                      stroke={getLineColor(metric)}
                      dot={false}
                      connectNulls={true}
                      yAxisId={leftAxisMetricSet.has(metric) ? 'left' : 'right'}
                    />
                  ))}
                  <YAxis yAxisId="left" hide />
                  <YAxis yAxisId="right" hide />
                </ComposedChart>
            </Brush>
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

    