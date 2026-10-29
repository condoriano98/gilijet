import { MS_PER_HOUR } from '@/shared/constants/time';

/** A passenger can review a trip once its departure is this long ago. */
export const REVIEW_OPENS_AFTER_DEPARTURE_MS = 2 * MS_PER_HOUR;
