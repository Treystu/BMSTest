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
  extractedData: z.string().describe('The extracted and structured data from the image.'),
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

You will use OCR to extract data from the image provided, interpret the data, and structure it in a JSON format.

First, identify a unique identifier for the battery from the image. This could be a serial number, a model number, or any other distinct text string that can be used to uniquely identify this specific battery. Assign this to the 'batteryId' field.

Then, extract data such as SOC, Voltage, Current, Capacity, Temperatures, and other metrics from the image.

Image: {{media url=photoDataUri}}

Return the extracted battery ID and the structured data in JSON format. Do not include any explanation or preamble.
`,
});

const extractAndStructureDataFlow = ai.defineFlow(
  {
    name: 'extractAndStructureDataFlow',
    inputSchema: ExtractAndStructureDataInputSchema,
    outputSchema: ExtractAndStructureDataOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
