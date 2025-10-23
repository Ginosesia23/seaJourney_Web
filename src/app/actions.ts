'use server';

import { generateAITour, GenerateAITourInput, GenerateAITourOutput } from '@/ai/flows/generate-ai-tour';
import { z } from 'zod';

const AITourSchema = z.object({
  location: z.string().min(2, "Location must be at least 2 characters."),
  duration: z.string().min(2, "Duration must be at least 2 characters."),
  interests: z.string().min(3, "Interests must be at least 3 characters."),
});

type FormState = {
  message: string;
  fields?: Record<string, string>;
  issues?: string[];
  data?: GenerateAITourOutput;
}

export async function createTour(prevState: FormState, formData: FormData): Promise<FormState> {
  const input: GenerateAITourInput = {
    location: formData.get('location') as string,
    duration: formData.get('duration') as string,
    interests: formData.get('interests') as string,
  };

  const validatedFields = AITourSchema.safeParse(input);

  if (!validatedFields.success) {
    const { fieldErrors } = validatedFields.error.flatten();
    
    return {
      message: "Please check your input.",
      fields: input,
      issues: Object.values(fieldErrors).flat(),
    }
  }

  try {
    const result = await generateAITour(validatedFields.data);
    return {
      message: "Tour generated successfully!",
      data: result,
    }
  } catch (error) {
    console.error(error);
    return {
      message: "An unexpected error occurred while generating the tour. Please try again.",
      fields: input,
    }
  }
}
