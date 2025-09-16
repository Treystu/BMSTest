"use client";

import { useState } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { DataDisplay } from "@/components/data-display";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay } from "@/components/chart-display";
import { getChartInfo } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";

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

  const handleDataExtracted = async (batteryId: string, newExtractedData: { extractedData: string; }[]) => {
    try {
      if (!batteryId) {
        toast({
          title: "Missing Battery ID",
          description: "Please provide a battery ID.",
          variant: "destructive",
        });
        return;
      }
      setActiveBatteryId(batteryId);

      const newPoints: DataPoint[] = [];
      let allInsights = "";

      for (const data of newExtractedData) {
        const parsedData = JSON.parse(data.extractedData);
        const timestamp = parsedData.timestamp || parsedData.Timestamp || parsedData.time || parsedData.Time || new Date().toISOString();
        
        const dataPoint: DataPoint = {
          timestamp: new Date(timestamp).getTime(),
        };

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
        newPoints.push(dataPoint);
        allInsights += `Data point at ${new Date(dataPoint.timestamp).toLocaleString()}: ${Object.entries(dataPoint).filter(([k]) => k !== 'timestamp').map(([k,v]) => `${k}: ${v}`).join(', ')}. `;
      }

      setDataByBattery(prev => {
        const existingHistory = prev[batteryId]?.history || [];
        const combinedHistory = [...existingHistory, ...newPoints].sort((a, b) => a.timestamp - b.timestamp);
        return {
          ...prev,
          [batteryId]: {
            ...prev[batteryId],
            history: combinedHistory
          }
        };
      });

      // After updating history, generate new chart info
      const currentData = dataByBattery[batteryId] || { history: [] };
      const combinedHistory = [...currentData.history, ...newPoints];
      const metrics = Object.keys(combinedHistory.reduce((acc, curr) => ({...acc, ...curr}), {})).filter(k => k !== 'timestamp');

      const result = await getChartInfo(metrics, "all time", allInsights);
      if (result.success && result.data) {
        setDataByBattery(prev => ({
          ...prev,
          [batteryId]: {
            ...prev[batteryId],
            history: prev[batteryId]?.history || [],
            chartInfo: result.data
          }
        }));
      }

    } catch (error) {
      console.error("Failed to process extracted data:", error);
      toast({
          title: 'Processing Failed',
          description: 'Could not process the extracted data.',
          variant: 'destructive',
        });
    }
  };

  const activeBatteryData = dataByBattery[activeBatteryId];
  const dataHistory = activeBatteryData?.history || [];
  const chartInfo = activeBatteryData?.chartInfo || null;

  const latestDataPoint = dataHistory.length > 0 ? dataHistory[dataHistory.length - 1] : null;
  
  const availableMetrics = dataHistory.length > 0 
    ? Object.keys(dataHistory.reduce((acc, curr) => ({...acc, ...curr}), {})).filter(k => k !== 'timestamp')
    : Object.keys(initialMetrics);
    
  const batteryIds = Object.keys(dataByBattery);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-6">
            <ImageUploader 
              onDataExtracted={handleDataExtracted} 
              setIsLoading={setIsLoading}
              activeBatteryId={activeBatteryId}
              setActiveBatteryId={setActiveBatteryId}
              batteryIds={batteryIds}
            />
            <DataDisplay data={latestDataPoint} />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-6">
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
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
