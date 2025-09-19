'use server';

import { extractAndStructureData } from '@/ai/flows/extract-and-structure-data';
import { analyzeCurrentStateFlow } from '@/ai/flows/analyze-current-state';
import { DataPoint } from '@/lib/types';

function parseTimestampFromFilename(filename: string): number {
  const sanitized = filename.replace(/[^0-9]/g, '');
  const match = sanitized.match(/(\d{14})/);
  if (match) {
    const dt = match[1];
    const year = dt.substring(0, 4);
    const month = dt.substring(4, 6);
    const day = dt.substring(6, 8);
    const hour = dt.substring(8, 10);
    const minute = dt.substring(10, 12);
    const second = dt.substring(12, 14);
    const dateString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }
  return new Date().getTime();
}

export async function processImage(photoDataUri: string, filename: string) {
  console.log(`[Server Action] processImage started for: ${filename}`);
  try {
    const extractionResult = await extractAndStructureData.run({ photoDataUri });
    const timestamp = parseTimestampFromFilename(filename);
    const result = {
      success: true,
      data: {
        batteryId: extractionResult.batteryId,
        extractedData: extractionResult.extractedData,
        timestamp: timestamp,
        fileName: filename,
      },
    };
    console.log(
      `[Server Action] processImage success for: ${filename}`,
      {
        batteryId: result.data.batteryId,
        timestamp: new Date(result.data.timestamp).toISOString(),
      }
    );
    return result;
  } catch (error) {
    console.error(`[Server Action] Error processing image ${filename}:`, error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during data extraction.',
    };
  }
}

export async function analyzeLatestData(latestDataPoint: DataPoint) {
  console.log('[Server Action] analyzeLatestData started');
  try {
    const { analysis } = await analyzeCurrentStateFlow.run({ latestDataPoint });
    console.log('[Server Action] analyzeLatestData success');
    return { success: true, analysis };
  } catch (error) {
    console.error('[Server Action] Error analyzing latest data:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during analysis.',
    };
  }
}
