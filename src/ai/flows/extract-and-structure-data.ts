'use server';
/**
 * @fileOverview An AI agent for extracting and structuring data from images.
 *
 * - extractAndStructureData - A function that handles the data extraction and structuring process.
 * - ExtractAndStructureDataInput - The input type for the extractAndStructureData function.
 * - ExtractAndStructureDataOutput - The return type for the extractAndStructureData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractAndStructureDataInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo containing data, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractAndStructureDataInput = z.infer<typeof ExtractAndStructureDataInputSchema>;

const ExtractAndStructureDataOutputSchema = z.object({
  batteryId: z.string().describe('A unique identifier for the battery, extracted from the image. This could be a serial number or model number.'),
  extractedData: z.string().describe('The extracted and structured data from the image as a raw JSON string.'),
});
export type ExtractAndStructureDataOutput = z.infer<typeof ExtractAndStructureDataOutputSchema>;

export async function extractAndStructureData(input: ExtractAndStructureDataInput): Promise<ExtractAndStructureDataOutput> {
  return extractAndStructureDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractAndStructureDataPrompt',
  input: {schema: ExtractAndStructureDataInputSchema},
  output: {schema: ExtractAndStructureDataOutputSchema},
  prompt: `You are an expert data extraction specialist.

You will use OCR to extract data from the image provided, interpret the data, and structure it.

First, identify the unique battery serial number from the image. The serial number for the batteries in these images always starts with "DL-". Find that text string and assign it to the 'batteryId' field.

Next, you MUST extract all metrics from the image. It is critical that you always extract the following fields if they are visible in the image:
- 'SOC' (sometimes labeled 'State of Charge')
- 'Voltage' (the primary voltage reading, not 'Maximum volt', 'Minimum volt', 'Average volt', or 'Voltage difference')
- 'Current'
- 'Capacity' (sometimes labeled 'Remaining Capacity')

Extract their full numerical values. Do not extract deltas or other differences for these core fields.

Then, extract any other metrics you can find.

Finally, structure all extracted metrics into a valid JSON object.

Image: {{media url=photoDataUri}}

Your response for 'extractedData' MUST be a raw, minified JSON string. Do not include any explanations, preambles, or markdown code fences like \`\`\`json. The string must be parsable by JSON.parse().
`,
});

const extractAndStructureDataFlow = ai.defineFlow(
  {
    name: 'extractAndStructureDataFlow',
    inputSchema: ExtractAndStructureDataInputSchema,
    outputSchema: ExtractAndStructureDataOutputSchema,
  },
  async (input) => {
    let attempts = 0;
    const maxAttempts = 5;
    const initialDelay = 1000; // 1 second

    while (attempts < maxAttempts) {
      try {
        const { output } = await prompt(input);
        return output!;
      } catch (error: any) {
        attempts++;
        // Check for retryable errors like 503 Service Unavailable or 429 Too Many Requests
        if (error.status === 503 || error.status === 429) {
          if (attempts >= maxAttempts) {
            console.error(`[extractAndStructureDataFlow] Max retry attempts reached for input:`, input);
            throw new Error(`The model is currently overloaded. Please try again later. (Max retries reached)`);
          }
          const delay = initialDelay * Math.pow(2, attempts - 1) + Math.random() * 1000;
          console.log(`[extractAndStructureDataFlow] Model overloaded or rate limited. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // For non-retryable errors, re-throw immediately
          console.error(`[extractAndStructureDataFlow] Non-retryable error encountered:`, error);
          throw error;
        }
      }
    }
    // This part should not be reachable if maxAttempts is > 0, but is here for type safety.
    throw new Error('Flow failed after multiple retries.');
  }
);
