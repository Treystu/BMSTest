"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBatteryAnalysis } from "@/app/actions";
import type { DataPoint, BatteryAnalysis } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from './ui/scroll-area';

type AnalysisDisplayProps = {
  batteryId: string | null;
  dataHistory: DataPoint[];
  analysis: BatteryAnalysis | null;
  onAnalysisUpdate: (analysis: BatteryAnalysis) => void;
};

const formatHour = (hour: number): string => {
    const h = hour % 24;
    const period = h < 12 ? 'AM' : 'PM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour} ${period}`;
};

export function AnalysisDisplay({ batteryId, dataHistory, analysis, onAnalysisUpdate }: AnalysisDisplayProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const handleRunAnalysis = async () => {
    if (!batteryId || dataHistory.length < 2) {
      toast({
        title: "Not Enough Data",
        description: "Need at least two data points to perform an analysis.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await getBatteryAnalysis({ history: dataHistory });
      if (result.success && result.data) {
        onAnalysisUpdate(result.data);
        toast({ title: "Analysis Complete", description: "Battery data trends have been analyzed." });
      } else {
        toast({
          title: "Analysis Failed",
          description: result.error || "An unknown error occurred.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Analysis Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Battery Usage Analysis</CardTitle>
        <CardDescription>
          Analyze hourly trends and day-over-day performance for the selected battery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-start">
          <Button onClick={handleRunAnalysis} disabled={isAnalyzing || !batteryId || dataHistory.length === 0}>
            {isAnalyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Run AI Analysis
          </Button>
        </div>

        {analysis ? (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">AI Trend Summary</h3>
              <p className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg border">
                {analysis.dayOverDayTrend}
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Hourly Averages</h3>
                <ScrollArea className="h-72 rounded-md border">
                    <Table>
                        <TableHeader className="sticky top-0 bg-background">
                            <TableRow>
                            <TableHead className="w-[100px]">Hour</TableHead>
                            <TableHead>Avg. Current (A)</TableHead>
                            <TableHead>Avg. SOC (%)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {analysis.hourlyAverages.map(({ hour, avgCurrent, avgSOC }) => (
                            <TableRow key={hour}>
                                <TableCell className="font-medium">{formatHour(hour)} - {formatHour(hour + 1)}</TableCell>
                                <TableCell>{avgCurrent.toFixed(2)}</TableCell>
                                <TableCell>{avgSOC.toFixed(2)}</TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-lg bg-muted/50 min-h-[200px]">
            <p className="text-sm text-muted-foreground">
              {isAnalyzing ? 'Analyzing data...' : 'Run an analysis to see the results here.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

    