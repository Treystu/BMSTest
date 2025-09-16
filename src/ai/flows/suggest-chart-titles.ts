'use server';

/**
 * @fileOverview Suggests chart titles and descriptions using an LLM based on extracted data insights.
 *
 * - suggestChartTitles - A function that generates chart titles and descriptions.
 * - SuggestChartTitlesInput - The input type for the suggestChartTitles function.
 * - SuggestChartTitlesOutput - The return type for the suggestChartTitles function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestChartTitlesInputSchema = z.object({
  metrics: z.array(z.string()).describe('The list of metrics being visualized in the chart (e.g., Voltage, Current, Temperature).'),
  timeRange: z.string().describe('The time range being displayed in the chart (e.g., 1 hour, 1 day, 1 week).'),
  insights: z.string().describe('A summary of the key trends and patterns observed in the extracted data.'),
});
export type SuggestChartTitlesInput = z.infer<typeof SuggestChartTitlesInputSchema>;

const SuggestChartTitlesOutputSchema = z.object({
  title: z.string().describe('A suggested title for the chart.'),
  description: z.string().describe('A suggested description for the chart, summarizing the key insights.'),
});
export type SuggestChartTitlesOutput = z.infer<typeof SuggestChartTitlesOutputSchema>;

export async function suggestChartTitles(input: SuggestChartTitlesInput): Promise<SuggestChartTitlesOutput> {
  return suggestChartTitlesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestChartTitlesPrompt',
  input: {schema: SuggestChartTitlesInputSchema},
  output: {schema: SuggestChartTitlesOutputSchema},
  prompt: `You are an expert data visualization specialist. Based on the following information about a time-based chart, suggest an appropriate title and description.

  Metrics: {{{metrics}}}
  Time Range: {{{timeRange}}}
  Insights: {{{insights}}}

  Title: 
  Description:`,
});

const suggestChartTitlesFlow = ai.defineFlow(
  {
    name: 'suggestChartTitlesFlow',
    inputSchema: SuggestChartTitlesInputSchema,
    outputSchema: SuggestChartTitlesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
