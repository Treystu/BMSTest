'use server';

import { extractAndStructureData } from '@/ai/flows/extract-and-structure-data';

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
    const year = dt.substring(0, 4);
    const month = dt.substring(4, 6);
    const day = dt.substring(6, 8);
    const hour = dt.substring(8, 10);
    const minute = dt.substring(10, 12);
    const second = dt.substring(12, 14);
    
    // Construct a date string in ISO 8601 format and specify UTC ('Z')
    // This treats the parsed time as "gospel" without timezone shifts.
    const dateString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    
    const date = new Date(dateString);

    if (!isNaN(date.getTime())) {
        return date.getTime();
    }
  }

  // Fallback to current time if no valid timestamp is found
  return new Date().getTime();
}


export async function processImage(photoDataUri: string, filename: string) {
  console.log(`[Server Action] processImage started for: ${filename}`);
  try {
    const extractionResult = await extractAndStructureData({ photoDataUri });
    const timestamp = parseTimestampFromFilename(filename);
    
    const result = {
      success: true,
      data: {
        batteryId: extractionResult.batteryId,
        extractedData: extractionResult.extractedData,
        timestamp: timestamp
      }
    };

    console.log(`[Server Action] processImage success for: ${filename}`, { batteryId: result.data.batteryId, timestamp: new Date(result.data.timestamp).toISOString() });
    return result;

  } catch (error) {
    console.error(`[Server Action] Error processing image ${filename}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred during data extraction."
    };
  }
}
    
