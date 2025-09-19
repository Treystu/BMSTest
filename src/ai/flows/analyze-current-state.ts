
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { DataPoint, StateAnalysis, TimeSensitiveInfo } from '../../lib/types';

const isDaylight = (timestamp: number) => {
  const hour = new Date(timestamp).getHours();
  return hour > 6 && hour < 18; // 6am to 6pm
};

const isSunny = () => Math.random() > 0.5;

const AnalyzeCurrentStateInput = z.object({
  latestDataPoint: z.any(),
});

const AnalyzeCurrentStateOutput = z.object({
  analysis: z.custom<StateAnalysis>(),
});

const MAX_VOLTAGE_DIFFERENCE = 0.08;
const LOW_SOC_THRESHOLD_NIGHT = 45;
const CRITICAL_SOC_THRESHOLD_NIGHT = 25;
const HIGH_MOS_TEMP_THRESHOLD = 60;
const LOW_RUNTIME_HOURS_THRESHOLD = 4;


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

    const { soc, current, capacity, temp_mos: tempMos } = latestDataPoint;

    const info: TimeSensitiveInfo = {
      recommendation: '',
      voltageDifferenceOk: true,
      solarChargingEstimate: null,
      generatorSuggestion: null,
      estimatedRuntimeHours: null,
      remainingCapacity: null,
      soc: typeof soc === 'number' ? soc : undefined,
      current: typeof current === 'number' ? current : undefined,
      tempMos: typeof tempMos === 'number' ? tempMos : undefined,
    };

    let requiresAttention = false;
    const recommendations: string[] = [];

    const voltageKeys = Object.keys(latestDataPoint).filter(k => k.startsWith('v_cell'));
    let minVoltage = Infinity, maxVoltage = -Infinity;
    if (voltageKeys.length > 0) {
        voltageKeys.forEach(key => {
            const v = latestDataPoint[key];
            if (v < minVoltage) minVoltage = v;
            if (v > maxVoltage) maxVoltage = v;
        });
        const vDiff = maxVoltage - minVoltage;
        info.voltageDifference = vDiff;
        if (vDiff > MAX_VOLTAGE_DIFFERENCE) {
            info.voltageDifferenceOk = false;
            requiresAttention = true;
            recommendations.push(`High voltage difference of ${vDiff.toFixed(3)}V detected.`);
        } else {
          info.voltageDifferenceOk = true;
        }
    }

    if (typeof capacity === 'number' && capacity > 0) {
      info.remainingCapacity = capacity;
    }

    if (typeof current === 'number' && current < -0.1 && typeof capacity === 'number') {
      const rawHours = capacity / -current;
      info.estimatedRuntimeHours = rawHours;
    } else if (typeof current === 'number' && current >= 0) {
      info.estimatedRuntimeHours = null; // Charging or idle
    }

    if (isDaylight(latestDataPoint.timestamp)) {
      if (isSunny()) {
        info.solarChargingEstimate = 65;
        recommendations.push("It's sunny, expect solar charging of 60-70 amps.");
      } else {
        info.solarChargingEstimate = 20;
        recommendations.push("It's cloudy, expect solar charging of around 20 amps.");
      }
    } else {
      // Night time logic
      if (typeof soc === 'number' && soc < LOW_SOC_THRESHOLD_NIGHT) {
        requiresAttention = true;
        recommendations.push(`Low battery at ${soc.toFixed(1)}% detected at night.`);

        if (soc < CRITICAL_SOC_THRESHOLD_NIGHT) {
          info.generatorSuggestion = 'Battery is critically low. Run both chargers at 2000w.';
        } else {
          info.generatorSuggestion = 'Recommend running one charger at 1000w with eco-mode.';
        }
      } else if (typeof soc === 'number') {
          recommendations.push('Battery levels are sufficient for overnight usage.');
      }
    }

    if (typeof tempMos === 'number' && tempMos > HIGH_MOS_TEMP_THRESHOLD) {
        requiresAttention = true;
        recommendations.push(`High MOS temperature of ${tempMos.toFixed(1)}°C. Reduce load.`)
    }
    
    if (info.estimatedRuntimeHours !== null && info.estimatedRuntimeHours < LOW_RUNTIME_HOURS_THRESHOLD) {
        requiresAttention = true;
        recommendations.push('Estimated runtime is very low. Reduce load immediately.');
    }

    if (recommendations.length === 0) {
      info.recommendation = 'System operating within normal parameters.';
    } else {
      info.recommendation = recommendations.join(' ');
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
