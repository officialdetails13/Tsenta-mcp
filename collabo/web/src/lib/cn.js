import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Combine class names, letting later Tailwind classes win (shadcn convention).
export const cn = (...inputs) => twMerge(clsx(inputs));
