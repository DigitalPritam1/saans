import { z } from 'zod';

export const aqiQuerySchema = z.object({
  lat: z.coerce
    .number({ invalid_type_error: 'Latitude must be a valid number' })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  lng: z.coerce
    .number({ invalid_type_error: 'Longitude must be a valid number' })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
});

export const planBodySchema = z.object({
  aqi: z.union([
    z.number().min(0).max(1000),
    z.object({
      aqi: z.number().min(0).max(1000),
      category: z.string().optional(),
      dominantPollutant: z.string().optional(),
      pm25: z.number().optional(),
      pm10: z.number().optional()
    })
  ]),
  profile: z.object({
    city: z.string().max(100).optional(),
    household: z.array(z.string().max(50)).optional(),
    residenceType: z.string().max(50).optional(),
    hasPurifier: z.boolean().optional(),
    commute: z.string().max(100).optional(),
    vulnerableMembers: z.array(z.string().max(50)).optional(),
    notes: z.string().max(200).optional()
  }).passthrough().optional().default({})
});

export const chatBodySchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(500, 'Message cannot exceed 500 characters'),
  profile: z.record(z.any()).optional().default({}),
  aqi: z.union([z.number(), z.record(z.any())]).optional().default(0),
  lang: z.enum(['en', 'hi', 'mr'], {
    message: "Language must be one of 'en', 'hi', or 'mr'"
  }).default('en')
});
