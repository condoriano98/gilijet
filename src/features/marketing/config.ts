import { env } from '@/shared/server/env';

/**
 * Which environment an event was recorded in. Vercel's custom `staging`
 * environment reports itself through VERCEL_TARGET_ENV; previews and local
 * runs fall back to VERCEL_ENV / NODE_ENV.
 */
export function marketingEnvironment(): string {
  return process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

export function isProductionEnvironment(): boolean {
  return marketingEnvironment() === 'production';
}

export function eventsEnabled(): boolean {
  return env.MARKETING_EVENTS_ENABLED === true;
}

export function deliveryEnabled(): boolean {
  return env.MARKETING_DELIVERY_ENABLED === true;
}

export function adsSyncEnabled(): boolean {
  return env.ADS_SYNC_ENABLED === true;
}

export function reportTimezone(): string {
  return env.REPORT_TIMEZONE || 'Asia/Jakarta';
}

export function ga4Configured(): boolean {
  return Boolean(env.GA4_MEASUREMENT_ID && env.GA4_API_SECRET);
}

export function metaCapiConfigured(): boolean {
  return Boolean(env.META_PIXEL_ID && env.META_CAPI_ACCESS_TOKEN);
}

export function googleAdsOAuthConfigured(): boolean {
  return Boolean(
    env.GOOGLE_ADS_CLIENT_ID &&
      env.GOOGLE_ADS_CLIENT_SECRET &&
      env.GOOGLE_ADS_REFRESH_TOKEN &&
      env.GOOGLE_ADS_CUSTOMER_ID,
  );
}

export function googleAdsConversionsConfigured(): boolean {
  return googleAdsOAuthConfigured() && Boolean(env.GOOGLE_ADS_PURCHASE_CONVERSION_ACTION_ID);
}

export function metaAdsReportingConfigured(): boolean {
  return Boolean((env.META_ADS_ACCESS_TOKEN || env.META_CAPI_ACCESS_TOKEN) && env.META_AD_ACCOUNT_ID);
}
