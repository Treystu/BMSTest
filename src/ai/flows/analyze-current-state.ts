
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { DataPoint, StateAnalysis, TimeSensitiveInfo } from '../../lib/types';

// Rough approximation of daylight hours for simplicity
const isDaylight = (timestamp: number) => {
  const hour = new Date(timestamp).getHours();
  return hour > 6 && hour < 18; // 6am to 6pm
};

// Placeholder for weather condition - in a real app, this would come from a weather API
const isSunny = () => Math.random() > 0.5;

// Define the input schema for the flow
const AnalyzeCurrentStateInput = z.object({
  latestDataPoint: z.any(), // Using z.any() to match DataPoint structure
});

// Define the output schema for the flow
const AnalyzeCurrentStateOutput = z.object({
  analysis: z.custom<StateAnalysis>(),
});

export const analyzeCurrentStateFlow = ai.defineFlow(
  {
    name: 'analyzeCurrentState',
    inputSchema: AnalyzeCurrentStateInput,
    outputSchema: AnalyzeCurrentStateOutput,
  },
  async ({ latestDataPoint }): Promise<{ analysis: StateAnalysis }> => {
    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;

    if (now - latestDataPoint.timestamp > sixHours) {
      return {
        analysis: {
          requiresAttention: false,
          info: null,
          timestamp: latestDataPoint.timestamp,
        },
      };
    }

    const info: TimeSensitiveInfo = {
      recommendation: '',
      voltageDifferenceOk: true,
      solarChargingEstimate: null,
      generatorSuggestion: null,
    };

    let requiresAttention = false;

    // 1. Crucial field validation
    if (latestDataPoint.v_diff > 0.1) {
      info.voltageDifferenceOk = false;
      info.recommendation += 'High voltage difference detected. Immediate attention required. ';
      requiresAttention = true;
    }

    // 2. Time-of-day awareness
    if (isDaylight(latestDataPoint.timestamp)) {
      // Daylight hours: Account for solar charging
      if (isSunny()) {
        info.solarChargingEstimate = 65; // Sunny: 60-70 amps
        info.recommendation += `It\'s sunny. Expect solar charging of around 60-70 amps. `;
      } else {
        info.solarChargingEstimate = 20; // Cloudy: ~20 amps
        info.recommendation += `It\'s cloudy. Expect solar charging of around 20 amps. `;
      }
    } else {
      // Night time: Check for low battery and suggest generator
      if (latestDataPoint.soc < 30) { // Assuming SOC < 30% is low battery
        requiresAttention = true;
        info.recommendation += `Low battery detected at night. Consider starting the generator. `;
        if (latestDataPoint.soc < 15) { // Critically low
          info.generatorSuggestion = 'Battery is critically low. Recommend running both chargers at 2000w for faster charging.';
        } else {
          info.generatorSuggestion = 'Recommend running one charger at 1000w with eco-mode for efficiency.';
        }
      }
    }

    // 3. Summarize recommendations
    if (!requiresAttention && info.recommendation === '') {
      info.recommendation = 'System operating within normal parameters.';
    }

    return {
      analysis: {
        requiresAttention,
        info,
        timestamp: latestDataPoint.timestamp,
      },
    };
  }
);
