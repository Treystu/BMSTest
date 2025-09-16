'use server';

import { extractAndStructureData } from '@/ai/flows/extract-and-structure-data';
import { suggestChartTitles } from '@/ai/flows/suggest-chart-titles';

export async function processImage(photoDataUri: string) {
  try {
    const { extractedData } = await extractAndStructureData({ photoDataUri });
    
    // We are returning the raw extracted data string.
    // The chart title generation will be handled on the client-side 
    // after all images in a batch are processed.
    
    return {
      success: true,
      data: {
        extractedData,
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
