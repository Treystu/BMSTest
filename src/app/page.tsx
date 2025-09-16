"use client";

import { useState, useMemo, useEffect } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics, ExtractionResult } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { DataDisplay } from "@/components/data-display";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay } from "@/components/chart-display";
import { getChartInfo } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";


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

export default function Home() {
  const [dataByBattery, setDataByBattery] = useState<Record<string, BatteryData>>({});
  const [activeBatteryId, setActiveBatteryId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetrics>(initialMetrics);
  const [timeRange, setTimeRange] = useState<string>("all");
  const { toast } = useToast();

  const batteryIds = useMemo(() => Object.keys(dataByBattery), [dataByBattery]);

  useEffect(() => {
    if (!activeBatteryId && batteryIds.length > 0) {
      setActiveBatteryId(batteryIds[0]);
    }
  }, [batteryIds, activeBatteryId]);

  const handleUploadComplete = async (results: { success: boolean, data?: ExtractionResult, error?: string }[]) => {
    const successfulExtractions = results.filter(r => r.success).map(r => r.data!);
    
    if (successfulExtractions.length === 0) {
        toast({ title: 'Extraction Failed', description: 'No data could be extracted from the images.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }

    const newDataByBattery = new Map<string, { newPoints: DataPoint[], allInsights: string }>();

    for (const data of successfulExtractions) {
        const { batteryId, extractedData, timestamp } = data;
        
        if (!newDataByBattery.has(batteryId)) {
            newDataByBattery.set(batteryId, { newPoints: [], allInsights: '' });
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
                            // Sanitize key: lowercase and remove special characters
                            const sanitizedKey = newKey.toLowerCase().replace(/[^a-z0-9]/gi, '');
                            dataPoint[sanitizedKey] = value;
                        }
                    }
                }
            }
            processObject(parsedData);
            entry.newPoints.push(dataPoint);
            entry.allInsights += `Data point at ${new Date(dataPoint.timestamp).toLocaleString()}: ${Object.entries(dataPoint).filter(([k]) => k !== 'timestamp').map(([k,v]) => `${k}: ${v}`).join(', ')}. `;
        } catch (e) {
            console.error(`Failed to parse data for battery ${batteryId}`, e);
        }
    }
    
    setDataByBattery(prev => {
        const updatedData = { ...prev };
        let firstNewBatteryId: string | null = null;

        newDataByBattery.forEach((value, key) => {
            if (!updatedData[key]) {
                if (!firstNewBatteryId) {
                    firstNewBatteryId = key;
                }
                updatedData[key] = { history: [], chartInfo: null };
            }
            const combinedHistory = [...updatedData[key].history, ...value.newPoints].sort((a, b) => a.timestamp - b.timestamp);
            updatedData[key] = {
                ...updatedData[key],
                history: combinedHistory
            };
        });

        if (firstNewBatteryId && !activeBatteryId) {
            setActiveBatteryId(firstNewBatteryId);
        } else if (!activeBatteryId && Object.keys(updatedData).length > 0) {
            setActiveBatteryId(Object.keys(updatedData)[0]);
        }
        
        return updatedData;
    });

    for (const [batteryId, { newPoints, allInsights }] of newDataByBattery.entries()) {
        const currentHistory = dataByBattery[batteryId]?.history || [];
        const combinedHistory = [...currentHistory, ...newPoints];
        const metrics = Object.keys(combinedHistory.reduce((acc, curr) => ({...acc, ...curr}), {})).filter(k => k !== 'timestamp');

        if(metrics.length > 0) {
          const result = await getChartInfo(metrics, "all time", allInsights);
          if (result.success && result.data) {
              setDataByBattery(prev => ({
                  ...prev,
                  [batteryId]: {
                      ...prev[batteryId],
                      chartInfo: result.data
                  }
              }));
          }
        }
    }
  };
  
  const activeBatteryData = activeBatteryId ? dataByBattery[activeBatteryId] : undefined;
  const dataHistory = activeBatteryData?.history || [];
  const chartInfo = activeBatteryData?.chartInfo || null;

  const latestDataPoint = dataHistory.length > 0 ? dataHistory[dataHistory.length - 1] : null;
  
  const availableMetrics = dataHistory.length > 0 
    ? Object.keys(dataHistory.reduce((acc, curr) => ({...acc, ...curr}), {})).filter(k => k !== 'timestamp')
    : Object.keys(initialMetrics);
    
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
                        <Tabs value={activeBatteryId} onValueChange={setActiveBatteryId}>
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
              batteryId={activeBatteryId}
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
