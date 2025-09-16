"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics, ExtractionResult } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { DataDisplay } from "@/components/data-display";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay } from "@/components/chart-display";
import { getChartInfo } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const DUPLICATE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const initialMetrics: SelectedMetrics = {
  soc: true,
  voltage: true,
  current: true,
  capacity: true,
  temperature: true,
};

type BatteryData = {
  history: DataPoint[];
  chartInfo: ChartInfo | null;
}

const averageDataPoints = (points: DataPoint[]): DataPoint[] => {
    if (points.length < 2) {
        return points;
    }

    const sortedPoints = [...points].sort((a, b) => a.timestamp - b.timestamp);
    const merged: DataPoint[] = [];
    let currentGroup: DataPoint[] = [sortedPoints[0]];

    for (let i = 1; i < sortedPoints.length; i++) {
        const currentPoint = sortedPoints[i];
        const lastPointInGroup = currentGroup[currentGroup.length - 1];

        if (currentPoint.timestamp - lastPointInGroup.timestamp <= DUPLICATE_THRESHOLD_MS) {
            currentGroup.push(currentPoint);
        } else {
            merged.push(mergeGroup(currentGroup));
            currentGroup = [currentPoint];
        }
    }
    merged.push(mergeGroup(currentGroup));

    console.log(`Averaged ${points.length} points into ${merged.length} points.`);
    return merged;
};

const mergeGroup = (group: DataPoint[]): DataPoint => {
    if (group.length === 1) {
        return group[0];
    }

    const totalPoints = group.length;
    const mergedPoint: DataPoint = { timestamp: 0 };
    const valueCounts: { [key: string]: number } = {};

    // Use the first point's timestamp as the reference for the merged group
    mergedPoint.timestamp = group[0].timestamp;

    for (const point of group) {
        // mergedPoint.timestamp += point.timestamp; // We don't average timestamp anymore
        for (const key in point) {
            if (key !== 'timestamp') {
                const value = point[key];
                if (typeof value === 'number' && !isNaN(value)) {
                    mergedPoint[key] = (mergedPoint[key] || 0) + value;
                    valueCounts[key] = (valueCounts[key] || 0) + 1;
                }
            }
        }
    }

    // mergedPoint.timestamp /= totalPoints;

    for (const key in valueCounts) {
        mergedPoint[key] /= valueCounts[key];
    }

    return mergedPoint;
};

const sanitizeMetricKey = (key: string): string => {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (lowerKey.includes('soc')) return 'soc';
    if (lowerKey.includes('volt')) return 'voltage';
    if (lowerKey.includes('curr')) return 'current';
    if (lowerKey.includes('cap')) return 'capacity';
    if (lowerKey.includes('temp')) return 'temperature';
    // Return a cleaned-up version of the original key if no standard match
    return key.toLowerCase().replace(/[^a-z0-9_]/gi, '').replace(/_+/g, '_');
};


export default function Home() {
  const [dataByBattery, setDataByBattery] = useState<Record<string, BatteryData>>({});
  const [activeBatteryId, setActiveBatteryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetrics>(initialMetrics);
  const [timeRange, setTimeRange] = useState<string>("all");
  const { toast } = useToast();

  const batteryIds = useMemo(() => Object.keys(dataByBattery), [dataByBattery]);

  useEffect(() => {
    // This effect ensures that if the active battery is removed,
    // we select a new one. It also selects the first battery
    // when data first loads.
    if (activeBatteryId && !dataByBattery[activeBatteryId]) {
      setActiveBatteryId(batteryIds.length > 0 ? batteryIds[0] : null);
    } else if (!activeBatteryId && batteryIds.length > 0) {
      setActiveBatteryId(batteryIds[0]);
    }
  }, [dataByBattery, batteryIds, activeBatteryId]);

  const updateChartInfo = useCallback(async (batteryId: string, history: DataPoint[]) => {
      const fullHistory = history;
      if (fullHistory.length === 0) return;

      const insights = fullHistory.map(dp => `Data point at ${new Date(dp.timestamp).toLocaleString()}: ${Object.entries(dp).filter(([k]) => k !== 'timestamp').map(([k,v]) => `${k}: ${v}`).join(', ')}. `).join('');
      const metrics = Object.keys(fullHistory.reduce((acc, curr) => ({...acc, ...curr}), {})).filter(k => k !== 'timestamp');

      if (metrics.length > 0) {
          try {
              const result = await getChartInfo(metrics, "all time", insights);
              if (result.success && result.data) {
                  setDataByBattery(prev => {
                      if (!prev[batteryId] || JSON.stringify(prev[batteryId].chartInfo) === JSON.stringify(result.data)) {
                          return prev;
                      }
                      return {
                          ...prev,
                          [batteryId]: {
                              ...prev[batteryId],
                              chartInfo: result.data
                          }
                      };
                  });
              }
          } catch(e) {
              console.error(`Error fetching chart info for ${batteryId}`, e);
          }
      }
  }, []);

  const handleUploadComplete = useCallback(async (results: { success: boolean, data?: ExtractionResult, error?: string }[]) => {
    console.log("handleUploadComplete received:", {
        totalResults: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
    });
    
    const successfulExtractions = results.filter(r => r.success).map(r => r.data!);
    
    if (successfulExtractions.length === 0) {
        toast({ title: 'Extraction Failed', description: 'No data could be extracted from the images.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }

    const newDataByBattery = new Map<string, { newPoints: DataPoint[] }>();

    for (const data of successfulExtractions) {
        const { batteryId, extractedData, timestamp } = data;
        
        if (!newDataByBattery.has(batteryId)) {
            newDataByBattery.set(batteryId, { newPoints: [] });
        }
        
        const entry = newDataByBattery.get(batteryId)!;

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
            entry.newPoints.push(dataPoint);
        } catch (e: any) {
            console.error(`Failed to parse data for battery ${batteryId}`, e.message, `Raw data: "${extractedData}"`);
            toast({
                title: 'Data Parsing Error',
                description: `Could not parse data for battery ${batteryId}. Error: ${e.message}`,
                variant: 'destructive',
            });
        }
    }

    let firstNewBatteryId: string | null = null;
    const updatedBatteryIds: string[] = [];

    setDataByBattery(prev => {
        const updatedData = { ...prev };

        newDataByBattery.forEach((value, key) => {
            updatedBatteryIds.push(key);
            if (!updatedData[key]) {
                if (!firstNewBatteryId) {
                    firstNewBatteryId = key;
                }
                updatedData[key] = { history: [], chartInfo: null };
            }

            const existingHistory = updatedData[key].history;
            const newPoints = value.newPoints;

            const combinedHistory = [...existingHistory, ...newPoints];
            const averagedHistory = averageDataPoints(combinedHistory);

            updatedData[key] = {
                ...updatedData[key],
                history: averagedHistory
            };
        });
        
        console.log("Updated dataByBattery state:", updatedData);
        
        return updatedData;
    });

    // Handle selection of a new battery and trigger chart updates
    // outside of the main state update to avoid render errors.
    setTimeout(() => {
        if (firstNewBatteryId) {
            setActiveBatteryId(firstNewBatteryId);
        }
        updatedBatteryIds.forEach(id => {
            setDataByBattery(currentData => {
                if (currentData[id]) {
                    updateChartInfo(id, currentData[id].history);
                }
                return currentData;
            });
        });
    }, 0);


  }, [toast, updateChartInfo]);
  
  const activeBatteryData = activeBatteryId ? dataByBattery[activeBatteryId] : undefined;
  const dataHistory = activeBatteryData?.history || [];
  const chartInfo = activeBatteryData?.chartInfo || null;

  const latestDataPoint = useMemo(() => {
    if (dataHistory.length > 0) {
      // Find the item with the most recent timestamp
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
    
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-6">
            <ImageUploader 
              onUploadComplete={handleUploadComplete} 
              setIsLoading={setIsLoading}
              isLoading={isLoading}
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
            <ChartControls
              availableMetrics={availableMetrics}
              selectedMetrics={selectedMetrics}
              setSelectedMetrics={setSelectedMetrics}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
            />
            <ChartDisplay
              batteryId={activeBatteryId || ""}
              data={dataHistory}
              selectedMetrics={selectedMetrics}
              timeRange={timeRange}
              chartInfo={chartInfo}
              isLoading={isLoading && dataHistory.length === 0}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
