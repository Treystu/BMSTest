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

export async function extractDataWithFunctionCallingFromImageBatch(images: {id: string, name: string, blob: Blob}[]) {
    try {
        const extractions = await Promise.all(images.map(async (image) => {
            const dataUrl = await blobToDataURL(image.blob);
            try {
                const result = await processImage(dataUrl, image.name);
                if (result.success) {
                    return { ...result, imageId: image.id };
                }
                return { success: false, error: result.error, imageId: image.id };

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                return { success: false, error: errorMessage, imageId: image.id };
            }
        }));
        
        return { success: true, extractions };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown batch processing error occurred';
        console.error('[extractDataWithFunctionCallingFromImageBatch] Batch failed:', error);
        return { success: false, error: errorMessage };
    }
}
