"use client";

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from './ui/scroll-area';
import { formatInTimeZone } from 'date-fns-tz';
import type { DataPoint } from "@/lib/types";

type AnalysisDisplayProps = {
  batteryId: string | null;
  dataHistory: DataPoint[];
};

type HourlyData = {
  hour: number;
  [day: string]: {
    currents: number[];
    socs: number[];
  } | number;
};

const formatHour = (hour: number): string => {
    const h = hour % 24;
    const period = h < 12 ? 'AM' : 'PM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour} ${period}`;
};

const getDayKey = (timestamp: number) => {
    return formatInTimeZone(new Date(timestamp), 'UTC', 'yyyy-MM-dd');
};
const formatDayHeader = (dayKey: string) => {
    const date = new Date(dayKey + 'T00:00:00Z'); // Treat key as UTC date
    return formatInTimeZone(date, 'UTC', 'MMM d, yyyy');
}


export function AnalysisDisplay({ batteryId, dataHistory }: AnalysisDisplayProps) {

  const { dailyData, uniqueDays } = useMemo(() => {
    if (!dataHistory || dataHistory.length === 0) {
      return { dailyData: [], uniqueDays: [] };
    }

    const hourlyBuckets: { [hour: number]: { [day: string]: { currents: number[]; socs: number[] } } } = {};
    const days = new Set<string>();

    for (let i = 0; i < 24; i++) {
        hourlyBuckets[i] = {};
    }

    dataHistory.forEach(dp => {
      const date = new Date(dp.timestamp);
      const hour = date.getUTCHours();
      const dayKey = getDayKey(dp.timestamp);

      days.add(dayKey);

      if (!hourlyBuckets[hour][dayKey]) {
        hourlyBuckets[hour][dayKey] = { currents: [], socs: [] };
      }

      if (dp.current !== undefined) hourlyBuckets[hour][dayKey].currents.push(dp.current);
      if (dp.soc !== undefined) hourlyBuckets[hour][dayKey].socs.push(dp.soc);
    });

    const sortedDays = Array.from(days).sort();

    const finalData: HourlyData[] = [];
    for (let i = 0; i < 24; i++) {
      const row: HourlyData = { hour: i };
      sortedDays.forEach(dayKey => {
        row[dayKey] = hourlyBuckets[i][dayKey] || { currents: [], socs: [] };
      });
      finalData.push(row);
    }
    
    return { dailyData: finalData, uniqueDays: sortedDays };

  }, [dataHistory]);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hourly Day-Over-Day Analysis</CardTitle>
        <CardDescription>
          Average Current (A) and State of Charge (SOC, %) for each hour across different days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {dataHistory.length > 1 ? (
            <ScrollArea className="h-[70vh] w-full rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[120px] min-w-[120px]">Time</TableHead>
                    {uniqueDays.map(day => (
                      <TableHead key={day} className="text-center min-w-[150px]">{formatDayHeader(day)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyData.map(({ hour, ...days }) => (
                    <TableRow key={hour}>
                      <TableCell className="font-medium">{formatHour(hour)} - {formatHour(hour+1)}</TableCell>
                       {uniqueDays.map(dayKey => {
                            const dayData = days[dayKey] as { currents: number[], socs: number[] };
                            const avgCurrent = dayData.currents.length > 0
                                ? (dayData.currents.reduce((a, b) => a + b, 0) / dayData.currents.length).toFixed(2)
                                : 'N/A';
                            const avgSOC = dayData.socs.length > 0
                                ? (dayData.socs.reduce((a, b) => a + b, 0) / dayData.socs.length).toFixed(2)
                                : 'N/A';
                            return (
                                <TableCell key={dayKey} className="text-center">
                                    <p>{avgCurrent} A</p>
                                    <p className="text-muted-foreground">{avgSOC} %</p>
                                </TableCell>
                            );
                       })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-lg bg-muted/50 min-h-[200px]">
            <p className="text-sm text-muted-foreground">
              Not enough data for analysis. Please upload at least two data points from different times.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
