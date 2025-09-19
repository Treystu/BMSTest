
'use server';

import { processImage } from '@/app/actions';

const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export async function extractTextFromImage(image: Blob) {
  // This is a placeholder. In a real app, you'd use an OCR library or a cloud service.
  return {
    success: true,
    text: '{"soc": "50%", "voltage": "12.5V", "current": "-2.1A", "capacity": "88Ah"}'
  };
}

export async function extractDataWithFunctionCalling(image: Blob, fileName: string) {
    const dataUrl = await blobToDataURL(image);
    const result = await processImage(dataUrl, fileName);
    return result;
}

export async function extractDataWithFunctionCallingFromImageBatch(images: Blob[]) {
    try {
        const extractions = await Promise.all(images.map(async (image, index) => {
            const dataUrl = await blobToDataURL(image);
            // We use a generic name here because the original filename is not available for blobs.
            // The caller should ideally pass in filenames if they are available.
            const fileName = `image_${Date.now()}_${index}.png`;
            try {
                const result = await processImage(dataUrl, fileName);
                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                return { success: false, error: errorMessage };
            }
        }));
        
        return { success: true, extractions };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown batch processing error occurred';
        console.error('[extractDataWithFunctionCallingFromImageBatch] Batch failed:', error);
        return { success: false, error: errorMessage };
    }
}
