'use server';

import { extractAndStructureData } from '@/ai/flows/extract-and-structure-data';
import { suggestChartTitles } from '@/ai/flows/suggest-chart-titles';

function parseTimestampFromFilename(filename: string): number {
  // Try to extract from formats like:
  // IMG_20240520_103000.jpg
  // 2024-05-20 10_30_00.png
  // 20240520103000.webp
  
  const sanitized = filename.replace(/[^0-9]/g, '');

  // Look for YYYYMMDDHHMMSS format (14 digits)
  const match = sanitized.match(/(\d{14})/);
  if (match) {
    const dt = match[1];
    const year = parseInt(dt.substring(0, 4));
    const month = parseInt(dt.substring(4, 6)) - 1; // JS months are 0-indexed
    const day = parseInt(dt.substring(6, 8));
    const hour = parseInt(dt.substring(8, 10));
    const minute = parseInt(dt.substring(10, 12));
    const second = parseInt(dt.substring(12, 14));
    
    // Check for valid date components
    if (year > 2000 && month >= 0 && month <= 11 && day > 0 && day <= 31) {
        const date = new Date(year, month, day, hour, minute, second);
        if (!isNaN(date.getTime())) {
            return date.getTime();
        }
    }
  }

  // Fallback to current time if no valid timestamp is found
  return new Date().getTime();
}


export async function processImage(photoDataUri: string, filename: string) {
  try {
    const extractionResult = await extractAndStructureData({ photoDataUri });
    const timestamp = parseTimestampFromFilename(filename);
    
    return {
      success: true,
      data: {
        batteryId: extractionResult.batteryId,
        extractedData: extractionResult.extractedData,
        timestamp: timestamp
      }
    };
  } catch (error) {
    console.error('Error processing image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred during data extraction."
    };
  }
}

export async function getChartInfo(metrics: string[], timeRange: string, insights: string) {
    try {
        const chartInfo = await suggestChartTitles({
            metrics,
            timeRange,
            insights,
        });
        return {
            success: true,
            data: chartInfo
        };
    } catch (error) {
        console.error('Error getting chart info:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "An unknown error occurred during chart info generation."
        };
    }
}
