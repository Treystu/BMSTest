"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics, ExtractionResult, BatteryDataMap } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { DataDisplay } from "@/components/data-display";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay, type BrushRange } from "@/components/chart-display";
import { getChartInfo } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { formatInTimeZone } from 'date-fns-tz';
import { AnalysisDisplay } from "@/components/analysis-display";


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
    if (lowerKey === 'soc' || lowerKey === 'stateofcharge') return 'soc';
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

export default function Home() {
  const [dataByBattery, setDataByBattery] = useState<BatteryDataMap>({});
  const [activeBatteryId, setActiveBatteryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetrics>(initialMetrics);
  const [dateRange, setDateRange] = useState<string>("all");
  const [brushRange, setBrushRange] = useState<BrushRange | null>(null);
  const { toast } = useToast();

  const batteryIds = useMemo(() => Object.keys(dataByBattery), [dataByBattery]);
  
  const handleGenerateSummary = useCallback(async () => {
      if (!activeBatteryId) {
          toast({ title: "No Battery Selected", description: "Please select a battery to generate a summary.", variant: "destructive" });
          return;
      }
      const history = dataByBattery[activeBatteryId]?.history || [];
      if (history.length === 0) {
          toast({ title: "No Data Available", description: "There is no data for the selected battery to summarize.", variant: "destructive" });
          return;
      }

      console.log(`[handleGenerateSummary] Generating chart info for battery: ${activeBatteryId}`);
      setIsGeneratingSummary(true);

      const insights = history.map(dp => `Data point at ${new Date(dp.timestamp).toLocaleString()}: ${Object.entries(dp).filter(([k]) => k !== 'timestamp').map(([k,v]) => `${k}: ${v}`).join(', ')}. `).join('');
      const metrics = Object.keys(history.reduce((acc, curr) => ({...acc, ...curr}), {})).filter(k => k !== 'timestamp');

      if (metrics.length > 0) {
          try {
              const result = await getChartInfo(metrics, "all time", insights);
              if (result.success && result.data) {
                  console.log(`[handleGenerateSummary] Successfully got chart info for ${activeBatteryId}`);
                  setDataByBattery(prev => ({
                      ...prev,
                      [activeBatteryId!]: {
                          ...prev[activeBatteryId!],
                          chartInfo: result.data
                      }
                  }));
                  toast({ title: "Summary Generated", description: "The AI-powered chart summary has been updated." });
              } else {
                  console.error(`[handleGenerateSummary] Failed to get chart info for ${activeBatteryId}`, result.error);
                  toast({ title: "Summary Generation Failed", description: result.error, variant: "destructive" });
              }
          } catch(e: any) {
              console.error(`[handleGenerateSummary] Error fetching chart info for ${activeBatteryId}`, e);
              toast({ title: "Summary Generation Error", description: e.message, variant: "destructive" });
          } finally {
              setIsGeneratingSummary(false);
          }
      }
  }, [activeBatteryId, dataByBattery, toast]);

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
            const combinedHistory = [...existingHistory, dataPoint].sort((a, b) => a.timestamp - b.timestamp);
            
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
            const combined = [...existingHistory, ...newHistory].sort((a, b) => a.timestamp - b.timestamp);
            
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
            
            <Tabs defaultValue="visualization">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="visualization">Visualization</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
              </TabsList>
              <TabsContent value="visualization" className="space-y-6 mt-6">
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
                <ChartControls
                  availableMetrics={availableMetrics}
                  selectedMetrics={selectedMetrics}
                  setSelectedMetrics={setSelectedMetrics}
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  onGenerateSummary={handleGenerateSummary}
                  isGeneratingSummary={isGeneratingSummary}
                  hasData={dataHistory.length > 0}
                />
                <ChartDisplay
                  batteryId={activeBatteryId || ""}
                  data={dataHistory}
                  selectedMetrics={selectedMetrics}
                  dateRange={dateRange}
                  chartInfo={chartInfo}
                  isLoading={isLoading && dataHistory.length === 0}
                  onBrushChange={handleBrushChange}
                />
              </TabsContent>
              <TabsContent value="analysis" className="mt-6">
                <AnalysisDisplay 
                  batteryId={activeBatteryId}
                  dataHistory={dataHistory}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
