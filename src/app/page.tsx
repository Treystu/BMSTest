"use client";

import { useState } from "react";
import type { DataPoint, ChartInfo, SelectedMetrics } from "@/lib/types";
import { Header } from "@/components/header";
import { ImageUploader } from "@/components/image-uploader";
import { DataDisplay } from "@/components/data-display";
import { ChartControls } from "@/components/chart-controls";
import { ChartDisplay } from "@/components/chart-display";

const initialMetrics: SelectedMetrics = {
  soc: true,
  voltage: true,
  current: true,
  capacity: true,
  temperature: true,
};

export default function Home() {
  const [dataHistory, setDataHistory] = useState<DataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chartInfo, setChartInfo] = useState<ChartInfo | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetrics>(initialMetrics);
  const [timeRange, setTimeRange] = useState<string>("all");

  const handleDataExtracted = (newData: { extractedData: string; chartInfo: ChartInfo; }) => {
    try {
      const parsedData = JSON.parse(newData.extractedData);
      const timestamp = parsedData.timestamp || parsedData.Timestamp || parsedData.time || parsedData.Time || new Date().toISOString();
      
      const dataPoint: DataPoint = {
        timestamp: new Date(timestamp).getTime(),
      };

      // Sanitize and flatten data
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

      setDataHistory(prev => [...prev, dataPoint].sort((a, b) => a.timestamp - b.timestamp));
      setChartInfo(newData.chartInfo);
    } catch (error) {
      console.error("Failed to parse extracted data:", error);
    }
  };

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
              onDataExtracted={handleDataExtracted} 
              setIsLoading={setIsLoading} 
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
