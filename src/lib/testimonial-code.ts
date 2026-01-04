/**
 * Generate a unique testimonial code in the format SJ-XXXX-XXXX
 * Uses uppercase alphanumeric characters (0-9, A-Z)
 */
export function generateTestimonialCode(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  const generateSegment = (length: number): string => {
    let segment = '';
    for (let i = 0; i < length; i++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return segment;
  };
  
  return `SJ-${generateSegment(4)}-${generateSegment(4)}`;
}







