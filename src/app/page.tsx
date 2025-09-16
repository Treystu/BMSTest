"use client";

import { useState, useMemo } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics, ExtractionResult } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { DataDisplay } from "@/components/data-display";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay } from "@/components/chart-display";
import { getChartInfo } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";


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

  const handleUploadComplete = async (results: { success: boolean, data?: ExtractionResult, error?: string }[]) => {
    const successfulExtractions = results.filter(r => r.success).map(r => r.data!);
    
    if (successfulExtractions.length === 0) {
        toast({ title: 'Extraction Failed', description: 'No data could be extracted from the images.', variant: 'destructive' });
        return;
    }

    const newDataByBattery = new Map<string, { newPoints: DataPoint[], allInsights: string }>();

    for (const data of successfulExtractions) {
        const { batteryId, extractedData } = data;
        
        if (!newDataByBattery.has(batteryId)) {
            newDataByBattery.set(batteryId, { newPoints: [], allInsights: '' });
        }
        
        const entry = newDataByBattery.get(batteryId)!;

        try {
            const parsedData = JSON.parse(extractedData);
            const timestamp = parsedData.timestamp || parsedData.Timestamp || parsedData.time || parsedData.Time || new Date().toISOString();
            
            const dataPoint: DataPoint = { timestamp: new Date(timestamp).getTime() };

            const processObject = (obj: any, prefix = '') => {
                for (const key in obj) {
                    if (key.toLowerCase() === 'timestamp') continue;
                    
                    const newKey = prefix ? `${prefix}_${key}` : key;
                    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                        processObject(obj[key], newKey);
                    } else {
                        const value = parseFloat(obj[key]);
                        if(!isNaN(value)) {
                            dataPoint[newKey.toLowerCase()] = value;
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
        newDataByBattery.forEach((value, key) => {
            const existingHistory = updatedData[key]?.history || [];
            const combinedHistory = [...existingHistory, ...value.newPoints].sort((a, b) => a.timestamp - b.timestamp);
            updatedData[key] = {
                ...updatedData[key],
                history: combinedHistory
            };
        });
        return updatedData;
    });

    for (const [batteryId, { newPoints, allInsights }] of newDataByBattery.entries()) {
        const currentData = dataByBattery[batteryId] || { history: [] };
        const combinedHistory = [...currentData.history, ...newPoints];
        const metrics = Object.keys(combinedHistory.reduce((acc, curr) => ({...acc, ...curr}), {})).filter(k => k !== 'timestamp');

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

    const firstNewBatteryId = Array.from(newDataByBattery.keys())[0];
    if (firstNewBatteryId && !batteryIds.includes(firstNewBatteryId)) {
      setActiveBatteryId(firstNewBatteryId);
    } else if (!activeBatteryId && batteryIds.length > 0) {
      setActiveBatteryId(batteryIds[0]);
    } else if (!activeBatteryId && firstNewBatteryId) {
      setActiveBatteryId(firstNewBatteryId);
    }
  };
  
  const batteryIds = useMemo(() => Object.keys(dataByBattery), [dataByBattery]);
  
  const activeBatteryData = dataByBattery[activeBatteryId];
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
