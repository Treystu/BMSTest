
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics, ExtractionResult, BatteryDataMap } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay, type VisibleRange } from "@/components/chart-display";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { formatInTimeZone } from 'date-fns-tz';
import { DayOverDayChart } from "@/components/day-over-day-chart";
import { motion, AnimatePresence } from 'framer-motion';

const initialMetrics: SelectedMetrics = {
  soc: true,
  voltage: true,
  current: true,
  capacity: true,
  temperature: true,
};

const sanitizeMetricKey = (key: string): string => {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/gi, '');
    
    if (lowerKey.includes('stateofcharge') || lowerKey.includes('soc')) return 'soc';
    if (lowerKey === 'voltage') return 'voltage';
    if (lowerKey === 'current') return 'current';
    if (lowerKey.includes('remainingcapacity') || lowerKey.includes('capacity') || lowerKey.includes('cap')) return 'capacity';
    if (lowerKey.includes('temp') && !lowerKey.includes('num')) return 'temperature';

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

export function mergeAndSortHistory<T extends { timestamp: number }>(existing: T[] = [], incoming: T[] = []): T[] {
    const dataMap = new Map<number, T>();

    // Add existing points to the map
    for (const point of existing) {
        if (point && typeof point.timestamp === 'number' && !isNaN(point.timestamp)) {
            dataMap.set(point.timestamp, point);
        }
    }
    // Add incoming points, overwriting existing ones with the same timestamp
    for (const point of incoming) {
        if (point && typeof point.timestamp === 'number' && !isNaN(point.timestamp)) {
            dataMap.set(point.timestamp, point);
        }
    }
    
    // Convert map values to an array and sort by timestamp
    return Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// A more robust parser that extracts the first valid number from a string.
const parseNumericValue = (value: any): number | null => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    
    // This regex looks for an optional negative sign, followed by digits, an optional decimal point, and more digits.
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) {
        const parsed = parseFloat(match[0]);
        // If the parsed number is 1, but the original string was more than just "1", it's likely a count or a parsing artifact.
        // For example, "1 sensor" or "1%" when we just want the value. We discard these.
        if (parsed === 1 && value.trim() !== "1") {
           return null;
        }
        // Same logic for 0
        if (parsed === 0 && value.trim() !== "0") {
            return null;
        }
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
    if (batteryIds.length > 0 && !activeBatteryId) {
        setActiveBatteryId(batteryIds[0]);
    }
  }, [batteryIds, activeBatteryId]);

  const handleNewDataPoint = useCallback((extractionData: ExtractionResult) => {
    console.log('[handleNewDataPoint] Processing new data point:', extractionData);
    const { batteryId, extractedData, timestamp, fileName } = extractionData;

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
                    const value = parseNumericValue(obj[key]);
                    if(value !== null) {
                        const sanitizedKey = sanitizeMetricKey(newKey);
                        // Don't overwrite an existing temperature if we've already found one
                        if (sanitizedKey === 'temperature' && dataPoint.temperature !== undefined) continue;
                        dataPoint[sanitizedKey] = value;
                    }
                }
            }
        }
        processObject(parsedData);
        
        setDataByBattery(prev => {
            const existingHistory = prev[batteryId]?.history || [];
            const existingRaw = prev[batteryId]?.rawExtractions || [];
            
            const combinedHistory = mergeAndSortHistory(existingHistory, [dataPoint]);
            const combinedRaw = mergeAndSortHistory(existingRaw, [extractionData]);
            
            return {
                ...prev,
                [batteryId]: {
                    ...prev[batteryId],
                    history: combinedHistory,
                    rawExtractions: combinedRaw,
                }
            };
        });
        
        if (fileName) {
            setProcessedFileNames(prev => new Set(prev).add(fileName));
        }
        
        if (!activeBatteryId) {
            setActiveBatteryId(batteryId);
        }

    } catch (e: any) {
        console.error(`[handleNewDataPoint] Failed to parse data for battery ${batteryId}`, e, `Raw data: "${extractedData}"`);
        toast({
            title: 'Data Parsing Error',
            description: `Could not parse data for battery ${batteryId}. Error: ${e.message}`,
            variant: 'destructive',
        });
    }
  }, [toast, activeBatteryId]);

  const handleMultipleDataPoints = useCallback((newData: BatteryDataMap) => {
    const newFileNames = new Set<string>();

    setDataByBattery(prevData => {
        const mergedData = { ...prevData };
        for (const batteryId in newData) {
            const newHistory = newData[batteryId].history || [];
            const newRawExtractions = newData[batteryId].rawExtractions || [];

            // Add new filenames from the imported data to a temporary set
            if (newData[batteryId].processedFileNames) {
                newData[batteryId].processedFileNames?.forEach(name => newFileNames.add(name));
            }
            
            const existingHistory = mergedData[batteryId]?.history || [];
            const existingRawExtractions = mergedData[batteryId]?.rawExtractions || [];
            
            // Use the robust merge and sort function for both history and raw data
            const combinedHistory = mergeAndSortHistory(existingHistory, newHistory);
            const combinedRaw = mergeAndSortHistory(existingRawExtractions, newRawExtractions);
            
            const existingChartInfo = mergedData[batteryId]?.chartInfo;
            const newChartInfo = newData[batteryId].chartInfo;
            
            // Combine filenames from both existing and new data
            const allFileNames = Array.from(new Set([...(mergedData[batteryId]?.processedFileNames || []), ...(newData[batteryId].processedFileNames || [])]));

            mergedData[batteryId] = {
                ...mergedData[batteryId],
                ...newData[batteryId],
                history: combinedHistory,
                rawExtractions: combinedRaw,
                chartInfo: newChartInfo || existingChartInfo || null,
                processedFileNames: allFileNames
            }
        }
        return mergedData;
    });

    if (newFileNames.size > 0) {
        setProcessedFileNames(prev => new Set([...prev, ...newFileNames]));
    }

    if (!activeBatteryId && Object.keys(newData).length > 0) {
        setActiveBatteryId(Object.keys(newData)[0]);
    }
  }, [activeBatteryId]);
  
  const activeBatteryData = activeBatteryId ? dataByBattery[activeBatteryId] : undefined;
  const dataHistory = activeBatteryData?.history || [];
  const chartInfo = activeBatteryData?.chartInfo || null;
  
  const availableMetrics = useMemo(() => {
    const allMetrics = new Set<string>();
    if (dataHistory.length > 0) {
      dataHistory.forEach(dp => {
        Object.keys(dp).forEach(key => {
          if (key !== 'timestamp') {
            allMetrics.add(key);
          }
        });
      });
    }
    // Ensure core metrics are always available for selection
    Object.keys(initialMetrics).forEach(m => allMetrics.add(m));
    return Array.from(allMetrics);
  }, [dataHistory]);

  const rangeAnalysisData = useMemo(() => {
    if (!isZoomed || !visibleRange || visibleRange.startIndex === undefined || visibleRange.endIndex === undefined || !activeBatteryId) return null;

    const slicedData = dataHistory.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
    
    if (slicedData.length === 0) return null;

    const stats: { [key: string]: { sum: number; count: number; average: number } } = {};
    const activeMetrics = Object.keys(selectedMetrics).filter(k => selectedMetrics[k as keyof SelectedMetrics]);

    activeMetrics.forEach(metric => {
        stats[metric] = { sum: 0, count: 0, average: 0 };
    });

    slicedData.forEach(dp => {
        activeMetrics.forEach(metric => {
            const value = dp[metric];
            if (value !== undefined && value !== null && !isNaN(value)) {
                stats[metric].sum += value;
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
  }, [isZoomed, visibleRange, dataHistory, selectedMetrics, activeBatteryId]);

  const handleVisibleRangeChange = useCallback((range: VisibleRange | null, zoomed: boolean) => {
    setVisibleRange(range);
    setIsZoomed(zoomed);
  }, []);
    
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <AnimatePresence>
          {!hasData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <ImageUploader 
                onNewDataPoint={handleNewDataPoint}
                onMultipleDataPoints={handleMultipleDataPoints}
                setIsLoading={setIsLoading}
                isLoading={isLoading}
                dataByBattery={dataByBattery}
                processedFileNames={processedFileNames}
              />
            </motion.div>
          )}
        </AnimatePresence>
        
        {hasData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div 
              className="lg:col-span-1 flex flex-col gap-6"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <ImageUploader 
                onNewDataPoint={handleNewDataPoint}
                onMultipleDataPoints={handleMultipleDataPoints}
                setIsLoading={setIsLoading}
                isLoading={isLoading}
                dataByBattery={dataByBattery}
                processedFileNames={processedFileNames}
              />
            </motion.div>
            <motion.div 
              className="lg:col-span-2 flex flex-col gap-6"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
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
                      {rangeAnalysisData && (
                      <Card>
                          <CardHeader>
                              <CardTitle>Selected Range Analysis</CardTitle>
                              <CardDescription>
                                  Average values from {rangeAnalysisData.startDate} to {rangeAnalysisData.endDate}.
                              </CardDescription>
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
                      <ChartDisplay
                      batteryId={activeBatteryId || ""}
                      data={dataHistory}
                      selectedMetrics={selectedMetrics}
                      dateRange={dateRange}
                      chartInfo={chartInfo}
                      isLoading={isLoading && dataHistory.length === 0}
                      onVisibleRangeChange={handleVisibleRangeChange}
                      />
                  </>
                  ) : (
                      <DayOverDayChart 
                          dataHistory={dataHistory} 
                          availableMetrics={availableMetrics} 
                      />
                  )}
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}

    