import { CountryCode } from '../enums/country-code.enum';

/** Timezone and currency are derived from country. Clients cannot send them. */
export const COUNTRY_DEFAULTS: Record<
  CountryCode,
  { timezone: string; currency: string }
> = {
  [CountryCode.EG]: {
    timezone: 'Africa/Cairo',
    currency: 'EGP',
  },
  [CountryCode.SA]: {
    timezone: 'Asia/Riyadh',
    currency: 'SAR',
  },
};
