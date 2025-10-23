'use server';

/**
 * @fileOverview Generates AI-powered travel tours based on user input.
 *
 * - generateAITour - A function that generates travel tours.
 * - GenerateAITourInput - The input type for the generateAITour function.
 * - GenerateAITourOutput - The return type for the generateAITour function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateAITourInputSchema = z.object({
  location: z.string().describe('The destination for the travel tour.'),
  duration: z.string().describe('The duration of the tour (e.g., 3 days, 1 week).'),
  interests: z.string().describe('Specific interests or activities (e.g., history, food, adventure).'),
});
export type GenerateAITourInput = z.infer<typeof GenerateAITourInputSchema>;

const GenerateAITourOutputSchema = z.object({
  tourDetails: z.string().describe('A detailed description of the AI-generated travel tour.'),
});
export type GenerateAITourOutput = z.infer<typeof GenerateAITourOutputSchema>;

export async function generateAITour(input: GenerateAITourInput): Promise<GenerateAITourOutput> {
  return generateAITourFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAITourPrompt',
  input: {schema: GenerateAITourInputSchema},
  output: {schema: GenerateAITourOutputSchema},
  prompt: `You are an AI travel assistant that is able to generate fun travel tours. Use the information below to create a compelling travel tour for the user.\n\nLocation: {{{location}}}\nDuration: {{{duration}}}\nInterests: {{{interests}}}\n\nCreate an interesting travel route, locations, and tips by gathering content found online about locations around the world.
Include a title, a brief description, a list of locations to visit each day, some tips for travel, and interesting facts about the location.`,
});

const generateAITourFlow = ai.defineFlow(
  {
    name: 'generateAITourFlow',
    inputSchema: GenerateAITourInputSchema,
    outputSchema: GenerateAITourOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
