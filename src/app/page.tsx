
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics, ExtractionResult, BatteryDataMap, StateAnalysis } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay, type VisibleRange } from "@/components/chart-display";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { formatInTimeZone } from 'date-fns-tz';
import { DayOverDayChart } from "@/components/day-over-day-chart";
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeLatestData } from "./actions";
import { TimeSensitiveDisplay } from "@/components/time-sensitive-display";

const initialMetrics: SelectedMetrics = {
  soc: true,
  voltage: true,
  current: true,
  capacity: true,
  temperature: true,
};

const sanitizeMetricKey = (key: string): string => {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (lowerKey === 'soc' || lowerKey === 'stateofcharge') return 'soc';
    if (lowerKey === 'voltage') return 'voltage';
    if (lowerKey === 'current') return 'current';
    if (lowerKey === 'capacity' || lowerKey === 'remainingcapacity') return 'capacity';
    if (lowerKey.includes('temp') && !lowerKey.includes('num') && !lowerKey.includes('count')) return 'temperature';
    if (lowerKey.startsWith('t') && !isNaN(parseInt(lowerKey.substring(1),10))) return 'temperature';
    if (lowerKey === 'mos') return 'temperature';
    return key.toLowerCase().replace(/[^a-z0-9_]/gi, '').replace(/\s+/g, '_').replace(/_+/g, '_');
};

const getFormattedDate = (timestamp: number | Date | string, formatStr: string): string => {
    if (timestamp === undefined || timestamp === null) return "Invalid Date";
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return "Invalid Date";
        return formatInTimeZone(date, 'UTC', formatStr);
    } catch (e) {
        console.error("Date formatting error:", e);
        return "Invalid Date";
    }
};

export function mergeAndSortHistory<T extends { timestamp: number }>(existing: T[] = [], incoming: T[] = []): T[] {
    const dataMap = new Map<number, T>();
    for (const point of existing) {
        if (point && typeof point.timestamp === 'number' && !isNaN(point.timestamp)) dataMap.set(point.timestamp, point);
    }
    for (const point of incoming) {
        if (point && typeof point.timestamp === 'number' && !isNaN(point.timestamp)) dataMap.set(point.timestamp, point);
    }
    return Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

const parseNumericValue = (value: any): number | null => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    const trimmedValue = value.trim();
    const match = trimmedValue.match(/-?\d+(\.\d+)?/);
    if (match) {
        const parsed = parseFloat(match[0]);
        if ((parsed === 1 && trimmedValue !== '1') || (parsed === 0 && trimmedValue !== '0')) return null;
        return parsed;
    }
    return null;
}

export default function Home() {
  const [dataByBattery, setDataByBattery] = useState<BatteryDataMap>({});
  const [processedFileNames, setProcessedFileNames] = useState<Set<string>>(new Set());
  const [activeBatteryId, setActiveBatteryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetrics>(initialMetrics);
  const [dateRange, setDateRange] = useState<string>("all");
  const [visibleRange, setVisibleRange] = useState<VisibleRange | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [chartMode, setChartMode] = useState<'trend' | 'day-over-day'>('trend');
  const { toast } = useToast();

  const batteryIds = useMemo(() => Object.keys(dataByBattery), [dataByBattery]);
  const hasData = batteryIds.length > 0;

  useEffect(() => {
    if (batteryIds.length > 0 && !activeBatteryId) setActiveBatteryId(batteryIds[0]);
  }, [batteryIds, activeBatteryId]);

  const handleNewDataPoint = useCallback(async (extractionData: ExtractionResult) => {
    const { batteryId, extractedData, timestamp, fileName } = extractionData;
    try {
        const parsedData = JSON.parse(extractedData);
        const dataPoint: DataPoint = { timestamp };
        const processObject = (obj: any, prefix = '') => {
            for (const key in obj) {
                if (!obj.hasOwnProperty(key) || key.toLowerCase() === 'timestamp') continue;
                const newKey = prefix ? `${prefix}_${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    processObject(obj[key], newKey);
                } else {
                    const sanitizedKey = sanitizeMetricKey(newKey);
                    const value = parseNumericValue(obj[key]);
                    if (sanitizedKey && value !== null) {
                        if (sanitizedKey === 'temperature' && dataPoint.temperature !== undefined) continue;
                        dataPoint[sanitizedKey] = value;
                    }
                }
            }
        }
        processObject(parsedData);

        const analysisResult = await analyzeLatestData(dataPoint);
        const analysis = analysisResult.success ? analysisResult.analysis : undefined;

        setDataByBattery(prev => ({
            ...prev,
            [batteryId]: {
                ...prev[batteryId],
                history: mergeAndSortHistory(prev[batteryId]?.history, [dataPoint]),
                rawExtractions: mergeAndSortHistory(prev[batteryId]?.rawExtractions, [extractionData]),
                analysis,
            }
        }));
        if (fileName) setProcessedFileNames(prev => new Set(prev).add(fileName));
        if (!activeBatteryId) setActiveBatteryId(batteryId);
    } catch (e: any) {
        console.error(`[handleNewDataPoint] Error: ${e.message}`, e, `Raw data: "${extractedData}"`);
        toast({ title: 'Error', description: `Failed to process data for ${batteryId}.`, variant: 'destructive' });
    }
  }, [toast, activeBatteryId]);

  const handleMultipleDataPoints = useCallback((newData: BatteryDataMap) => {
    const newFileNames = new Set<string>();
    setDataByBattery(prevData => {
        const mergedData = { ...prevData };
        for (const batteryId in newData) {
            const { history = [], rawExtractions = [], processedFileNames: files, chartInfo: newInfo } = newData[batteryId];
            files?.forEach(name => newFileNames.add(name));
            const existing = mergedData[batteryId];
            mergedData[batteryId] = {
                ...existing, ...newData[batteryId],
                history: mergeAndSortHistory(existing?.history, history),
                rawExtractions: mergeAndSortHistory(existing?.rawExtractions, rawExtractions),
                chartInfo: newInfo || existing?.chartInfo || null,
                processedFileNames: Array.from(new Set([...(existing?.processedFileNames || []), ...(files || [])]))
            };
        }
        return mergedData;
    });
    if (newFileNames.size > 0) setProcessedFileNames(prev => new Set([...prev, ...newFileNames]));
    if (!activeBatteryId && Object.keys(newData).length > 0) setActiveBatteryId(Object.keys(newData)[0]);
  }, [activeBatteryId]);

  const activeBatteryData = activeBatteryId ? dataByBattery[activeBatteryId] : undefined;
  const dataHistory = activeBatteryData?.history || [];
  const chartInfo = activeBatteryData?.chartInfo || null;
  const analysis = activeBatteryData?.analysis || null;

  const availableMetrics = useMemo(() => {
    const allMetrics = new Set<string>(Object.keys(initialMetrics));
    dataHistory.forEach(dp => Object.keys(dp).forEach(key => key !== 'timestamp' && allMetrics.add(key)));
    return Array.from(allMetrics);
  }, [dataHistory]);

  const rangeAnalysisData = useMemo(() => {
    if (!isZoomed || !visibleRange || visibleRange.startIndex === undefined || visibleRange.endIndex === undefined || !activeBatteryId) return null;
    const slicedData = dataHistory.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
    if (slicedData.length === 0) return null;

    const stats: { [key: string]: { sum: number; count: number; average: number } } = {};
    const activeMetrics = Object.keys(selectedMetrics).filter(k => selectedMetrics[k as keyof SelectedMetrics]);
    activeMetrics.forEach(metric => { stats[metric] = { sum: 0, count: 0, average: 0 }; });

    slicedData.forEach(dp => {
        activeMetrics.forEach(metric => {
            const value = dp[metric];
            if (value !== undefined && value !== null && !isNaN(value)) {
                stats[metric].sum += value;
                stats[metric].count++;
            }
        });
    });

    activeMetrics.forEach(metric => { if (stats[metric].count > 0) stats[metric].average = stats[metric].sum / stats[metric].count; });

    return {
        startDate: getFormattedDate(slicedData[0].timestamp, "MMM d, yyyy, h:mm:ss a"),
        endDate: getFormattedDate(slicedData[slicedData.length - 1].timestamp, "MMM d, yyyy, h:mm:ss a"),
        stats
    };
  }, [isZoomed, visibleRange, dataHistory, selectedMetrics, activeBatteryId]);

  const handleVisibleRangeChange = useCallback((range: VisibleRange | null, zoomed: boolean) => {
    setVisibleRange(range);
    setIsZoomed(zoomed);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className={`grid grid-cols-1 ${hasData ? 'lg:grid-cols-3' : ''} gap-6`}>
            <motion.div
                layout
                className={`${hasData ? 'lg:col-span-1' : 'max-w-2xl mx-auto'} flex flex-col gap-6`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <ImageUploader
                    onNewDataPoint={handleNewDataPoint}
                    onMultipleDataPoints={handleMultipleDataPoints}
                    setIsLoading={setIsLoading}
                    isLoading={isLoading}
                    dataByBattery={dataByBattery}
                    processedFileNames={processedFileNames}
                />
                {hasData && <TimeSensitiveDisplay analysis={analysis} />}
            </motion.div>

            <AnimatePresence>
                {hasData && (
                    <motion.div
                        className="lg:col-span-2 flex flex-col gap-6"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                    >
                        {batteryIds.length > 0 && (
                            <Card>
                                <CardHeader className="p-4"><CardTitle className="text-lg">Select Battery</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-0">
                                    <Tabs value={activeBatteryId || ""} onValueChange={setActiveBatteryId}>
                                        <TabsList>
                                            {batteryIds.map(id => <TabsTrigger key={id} value={id}>{id}</TabsTrigger>)}
                                        </TabsList>
                                    </Tabs>
                                </CardContent>
                            </Card>
                        )}

                        <div className="space-y-6">
                            <ChartControls {...{ availableMetrics, selectedMetrics, setSelectedMetrics, dateRange, setDateRange, hasData: dataHistory.length > 0, chartMode, setChartMode }} />
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={chartMode}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {chartMode === 'trend' ? (
                                        <div className="space-y-6">
                                            {rangeAnalysisData && (
                                                <Card>
                                                    <CardHeader>
                                                        <CardTitle>Selected Range Analysis</CardTitle>
                                                        <CardDescription>Averages from {rangeAnalysisData.startDate} to {rangeAnalysisData.endDate}.</CardDescription>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                            {Object.entries(rangeAnalysisData.stats).map(([metric, data]) => (
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
                                            <ChartDisplay {...{ batteryId: activeBatteryId || "", data: dataHistory, selectedMetrics, dateRange, chartInfo, isLoading: isLoading && dataHistory.length === 0, onVisibleRangeChange: handleVisibleRangeChange }} />
                                        </div>
                                    ) : (
                                        <DayOverDayChart {...{ dataHistory, availableMetrics }} />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
