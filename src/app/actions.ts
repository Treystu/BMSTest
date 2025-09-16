'use server';

import { extractAndStructureData } from '@/ai/flows/extract-and-structure-data';
import { suggestChartTitles } from '@/ai/flows/suggest-chart-titles';

export async function processImage(photoDataUri: string) {
  try {
    const { extractedData } = await extractAndStructureData({ photoDataUri });
    
    const parsedData = JSON.parse(extractedData);
    const metrics = Object.keys(parsedData).filter(k => typeof parsedData[k] === 'number');
    const insights = `The following data was extracted: ${Object.entries(parsedData).map(([k,v]) => `${k}: ${v}`).join(', ')}.`;

    const chartInfo = await suggestChartTitles({
        metrics,
        timeRange: 'Single data point',
        insights,
    });
    
    return {
      success: true,
      data: {
        extractedData,
        chartInfo,
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
