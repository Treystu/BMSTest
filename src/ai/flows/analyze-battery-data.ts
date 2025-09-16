'use server';
/**
 * @fileOverview An AI agent for analyzing battery time-series data.
 *
 * - analyzeBatteryData - A function that handles the data analysis process.
 * - AnalyzeBatteryDataInput - The input type for the analyzeBatteryData function.
 * - AnalyzeBatteryDataOutput - The return type for the analyzeBatteryData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { DataPoint } from '@/lib/types';

const AnalyzeBatteryDataInputSchema = z.object({
  history: z.array(z.custom<DataPoint>()).describe("The time-series data for a single battery. Each point must have a 'timestamp' (Unix epoch milliseconds), 'current', and 'soc'."),
});
export type AnalyzeBatteryDataInput = z.infer<typeof AnalyzeBatteryDataInputSchema>;

const HourlyAnalysisSchema = z.object({
    hour: z.number().describe("The hour of the day (0-23)."),
    avgCurrent: z.number().describe("The average current (charge/discharge rate) for this hour. Positive is charge, negative is discharge."),
    avgSOC: z.number().describe("The average State of Charge (%) for this hour."),
});

const AnalyzeBatteryDataOutputSchema = z.object({
  hourlyAverages: z.array(HourlyAnalysisSchema).describe("An array of 24 objects, one for each hour of the day, with calculated averages."),
  dayOverDayTrend: z.string().describe("A multi-sentence summary of the day-over-day trends. Analyze patterns in charging and discharging across different days of the week or in general. Identify peak usage times, common charging periods, and any anomalies or interesting patterns you observe from the hourly data."),
});
export type AnalyzeBatteryDataOutput = z.infer<typeof AnalyzeBatteryDataOutputSchema>;

// Helper function to process data locally before sending to the model
const processDataForAnalysis = (history: DataPoint[]) => {
    const hourlyData: { [hour: number]: { currents: number[], socs: number[] } } = {};

    for (let i = 0; i < 24; i++) {
        hourlyData[i] = { currents: [], socs: [] };
    }

    history.forEach(dp => {
        if (dp.timestamp && dp.current !== undefined && dp.soc !== undefined) {
            const date = new Date(dp.timestamp);
            const hour = date.getUTCHours();
            
            hourlyData[hour].currents.push(dp.current);
            hourlyData[hour].socs.push(dp.soc);
        }
    });

    const hourlyAverages = Object.entries(hourlyData).map(([hour, data]) => {
        const hourNum = parseInt(hour, 10);
        const avgCurrent = data.currents.length > 0 ? data.currents.reduce((a, b) => a + b, 0) / data.currents.length : 0;
        const avgSOC = data.socs.length > 0 ? data.socs.reduce((a, b) => a + b, 0) / data.socs.length : 0;
        return { hour: hourNum, avgCurrent, avgSOC };
    });

    return hourlyAverages;
}


export async function analyzeBatteryData(input: AnalyzeBatteryDataInput): Promise<AnalyzeBatteryDataOutput> {
  return analyzeBatteryDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeBatteryDataPrompt',
  input: { schema: z.object({ hourlyAverages: z.array(HourlyAnalysisSchema) }) },
  output: { schema: z.object({ dayOverDayTrend: AnalyzeBatteryDataOutputSchema.shape.dayOverDayTrend }) },
  prompt: `You are a battery data analyst. You have been provided with hourly average data for a battery's current and state of charge (SOC).

Your task is to analyze this data to identify day-over-day trends and provide a summary of your findings.

Based on the following hourly averages, generate a multi-sentence summary of the day-over-day trends. Analyze patterns in charging (positive current) and discharging (negative current) across the hours of the day. Identify peak usage times (high discharge), common charging periods, and any other interesting patterns or anomalies you observe. For example: "The battery typically charges during the early morning hours and sees its heaviest discharge in the late afternoon and evening, suggesting high usage during peak hours. The State of Charge consistently drops below 20% during these peak times."

Hourly Averages Data:
{{{jsonStringify hourlyAverages}}}
`,
});

const analyzeBatteryDataFlow = ai.defineFlow(
  {
    name: 'analyzeBatteryDataFlow',
    inputSchema: AnalyzeBatteryDataInputSchema,
    outputSchema: AnalyzeBatteryDataOutputSchema,
  },
  async (input) => {
    // First, process the raw data locally to get hourly averages
    const hourlyAverages = processDataForAnalysis(input.history);

    // Then, send only the aggregated data to the model to generate insights
    const { output } = await prompt({ hourlyAverages });
    const trend = output?.dayOverDayTrend || "No trend analysis available.";

    // Combine local processing and AI insight into the final output
    return {
        hourlyAverages,
        dayOverDayTrend: trend,
    };
  }
);

    