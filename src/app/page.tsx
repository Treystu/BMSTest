"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics, ExtractionResult, BatteryDataMap } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { DataDisplay } from "@/components/data-display";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay, type BrushRange } from "@/components/chart-display";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { formatInTimeZone } from 'date-fns-tz';
import { DayOverDayChart } from "@/components/day-over-day-chart";

const initialMetrics: SelectedMetrics = {
  soc: true,
  voltage: true,
  current: true,
  capacity: true,
  temperature: true,
};

const sanitizeMetricKey = (key: string): string => {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/gi, '');
    
    if (lowerKey === 'voltage') return 'voltage';
    if (lowerKey.includes('soc') || lowerKey.includes('stateofcharge')) return 'soc';
    if (lowerKey === 'current') return 'current';
    if (lowerKey.includes('capacity') || lowerKey.includes('cap')) return 'capacity';
    if (lowerKey.includes('temp')) return 'temperature';

    return key.toLowerCase().replace(/[^a-z0-9_]/gi, '').replace(/\s+/g, '_').replace(/_+/g, '_');
};

const getFormattedDate = (timestamp: number | Date | string, formatStr: string): string => {
    if (timestamp === undefined || timestamp === null) return "Invalid Date";
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            return "Invalid Date";
        }
        return formatInTimeZone(date, 'UTC', formatStr);
    } catch (e) {
        console.error("Date formatting error:", e);
        return "Invalid Date";
    }
};

const mergeAndSortHistory = (histories: DataPoint[][]): DataPoint[] => {
    const dataMap = new Map<number, DataPoint>();

    for (const history of histories) {
        for (const point of history) {
            if (point && typeof point.timestamp === 'number') {
                const existing = dataMap.get(point.timestamp);
                if (existing) {
                    dataMap.set(point.timestamp, { ...existing, ...point });
                } else {
                    dataMap.set(point.timestamp, point);
                }
            }
        }
    }
    
    return Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export default function Home() {
  const [dataByBattery, setDataByBattery] = useState<BatteryDataMap>({});
  const [activeBatteryId, setActiveBatteryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetrics>(initialMetrics);
  const [dateRange, setDateRange] = useState<string>("all");
  const [brushRange, setBrushRange] = useState<BrushRange | null>(null);
  const [chartMode, setChartMode] = useState<'trend' | 'day-over-day'>('trend');
  const { toast } = useToast();

  const batteryIds = useMemo(() => Object.keys(dataByBattery), [dataByBattery]);

  useEffect(() => {
    if (batteryIds.length > 0 && !activeBatteryId) {
        setActiveBatteryId(batteryIds[0]);
    }
  }, [batteryIds, activeBatteryId]);

  const handleNewDataPoint = useCallback((extractionData: ExtractionResult) => {
    console.log('[handleNewDataPoint] Processing new data point:', extractionData);
    const { batteryId, extractedData, timestamp } = extractionData;

    try {
        const parsedData = JSON.parse(extractedData);
        const dataPoint: DataPoint = { timestamp };

        const processObject = (obj: any, prefix = '') => {
            for (const key in obj) {
                if (key.toLowerCase() === 'timestamp') continue;
                
                const newKey = prefix ? `${prefix}_${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    processObject(obj[key], newKey);
                } else {
                    const value = parseFloat(obj[key]);
                    if(!isNaN(value)) {
                        const sanitizedKey = sanitizeMetricKey(newKey);
                        dataPoint[sanitizedKey] = value;
                    }
                }
            }
        }
        processObject(parsedData);
        
        setDataByBattery(prev => {
            const existingHistory = prev[batteryId]?.history || [];
            const combinedHistory = mergeAndSortHistory([existingHistory, [dataPoint]]);
            
            return {
                ...prev,
                [batteryId]: {
                    ...prev[batteryId],
                    history: combinedHistory
                }
            };
        });
        
        if (!activeBatteryId) {
            setActiveBatteryId(batteryId);
        }

    } catch (e: any) {
        console.error(`[handleNewDataPoint] Failed to parse data for battery ${batteryId}`, e.message, `Raw data: "${extractedData}"`);
        toast({
            title: 'Data Parsing Error',
            description: `Could not parse data for battery ${batteryId}. Error: ${e.message}`,
            variant: 'destructive',
        });
    }
  }, [toast, activeBatteryId]);

  const handleMultipleDataPoints = useCallback((newData: BatteryDataMap) => {
    setDataByBattery(prevData => {
        const mergedData = { ...prevData };
        for (const batteryId in newData) {
            const newHistory = newData[batteryId].history || [];
            const existingHistory = mergedData[batteryId]?.history || [];
            const combined = mergeAndSortHistory([existingHistory, newHistory]);
            
            const existingChartInfo = mergedData[batteryId]?.chartInfo;
            const newChartInfo = newData[batteryId].chartInfo;

            mergedData[batteryId] = {
                ...mergedData[batteryId],
                ...newData[batteryId],
                history: combined,
                chartInfo: newChartInfo || existingChartInfo || null
            }
        }
        return mergedData;
    });

    if (!activeBatteryId && Object.keys(newData).length > 0) {
        setActiveBatteryId(Object.keys(newData)[0]);
    }
  }, [activeBatteryId]);
  
  const activeBatteryData = activeBatteryId ? dataByBattery[activeBatteryId] : undefined;
  const dataHistory = activeBatteryData?.history || [];
  const chartInfo = activeBatteryData?.chartInfo || null;

  const latestDataPoint = useMemo(() => {
    if (dataHistory.length > 0) {
      return dataHistory.reduce((latest, current) => {
        return current.timestamp > latest.timestamp ? current : latest;
      });
    }
    return null;
  }, [dataHistory]);
  
  const availableMetrics = useMemo(() => {
    if (dataHistory.length > 0) {
      const allKeys = dataHistory.reduce((acc, curr) => {
        Object.keys(curr).forEach(key => acc.add(key));
        return acc;
      }, new Set<string>());
      allKeys.delete('timestamp');
      return Array.from(allKeys);
    }
    return Object.keys(initialMetrics);
  }, [dataHistory]);

  const brushData = useMemo(() => {
    if (!brushRange || brushRange.startIndex === undefined || brushRange.endIndex === undefined || !activeBatteryId) return null;

    const slicedData = dataHistory.slice(brushRange.startIndex, brushRange.endIndex + 1);
    
    if (slicedData.length === 0) return null;

    const stats: { [key: string]: { sum: number; count: number; average: number } } = {};
    const activeMetrics = Object.keys(selectedMetrics).filter(k => selectedMetrics[k as keyof SelectedMetrics]);

    activeMetrics.forEach(metric => {
        stats[metric] = { sum: 0, count: 0, average: 0 };
    });

    slicedData.forEach(dp => {
        activeMetrics.forEach(metric => {
            if (dp[metric] !== undefined && dp[metric] !== null) {
                stats[metric].sum += dp[metric];
                stats[metric].count++;
            }
        });
    });

    activeMetrics.forEach(metric => {
        if (stats[metric].count > 0) {
            stats[metric].average = stats[metric].sum / stats[metric].count;
        }
    });

    return {
        startDate: getFormattedDate(slicedData[0].timestamp, "MMM d, yyyy, h:mm:ss a"),
        endDate: getFormattedDate(slicedData[slicedData.length - 1].timestamp, "MMM d, yyyy, h:mm:ss a"),
        stats
    };
  }, [brushRange, dataHistory, selectedMetrics, activeBatteryId]);

  const handleBrushChange = useCallback((range: BrushRange | null) => {
    setBrushRange(range);
  }, []);
    
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-6">
            <ImageUploader 
              onNewDataPoint={handleNewDataPoint}
              onMultipleDataPoints={handleMultipleDataPoints}
              setIsLoading={setIsLoading}
              isLoading={isLoading}
              dataByBattery={dataByBattery}
            />
            <DataDisplay data={latestDataPoint} />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-6">
            {batteryIds.length > 0 && (
                <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-lg">Select Battery</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <Tabs value={activeBatteryId || ""} onValueChange={setActiveBatteryId}>
                            <TabsList>
                                {batteryIds.map(id => (
                                    <TabsTrigger key={id} value={id}>{id}</TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </CardContent>
                </Card>
            )}
            
            <div className="space-y-6">
                <ChartControls
                availableMetrics={availableMetrics}
                selectedMetrics={selectedMetrics}
                setSelectedMetrics={setSelectedMetrics}
                dateRange={dateRange}
                setDateRange={setDateRange}
                hasData={dataHistory.length > 0}
                chartMode={chartMode}
                setChartMode={setChartMode}
                />
                {chartMode === 'trend' ? (
                <>
                    {brushData && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Selected Range Analysis</CardTitle>
                            <CardDescription>
                                Average values from {brushData.startDate} to {brushData.endDate}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                {Object.entries(brushData.stats).map(([metric, data]) => (
                                data.count > 0 && (
                                    <div key={metric}>
                                        <p className="font-semibold capitalize">{metric.replace(/_/g, ' ')}</p>
                                        <p className="text-muted-foreground">{data.average.toFixed(3)}</p>
                                    </div>
                                )
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                    )}
                    <ChartDisplay
                    batteryId={activeBatteryId || ""}
                    data={dataHistory}
                    selectedMetrics={selectedMetrics}
                    dateRange={dateRange}
                    chartInfo={chartInfo}
                    isLoading={isLoading && dataHistory.length === 0}
                    onBrushChange={handleBrushChange}
                    />
                </>
                ) : (
                    <DayOverDayChart 
                        dataHistory={dataHistory} 
                        availableMetrics={availableMetrics} 
                    />
                )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
