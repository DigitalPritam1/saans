import { config } from '../config.js';
import { weatherCache, getWeatherCacheKey } from './cache.js';

/**
 * Connects weather conditions to smog / inversion risk in plain words
 * Rule: wind under 8 km/h and temperature under 15 °C indicates inversion risk
 *
 * @param {number|null} windSpeed - Wind speed in km/h
 * @param {number|null} temperature - Temperature in °C
 * @returns {{ hasRisk: boolean, text: string }|null}
 */
export function getInversionRiskAnalysis(windSpeed, temperature) {
  if (typeof windSpeed !== 'number' || isNaN(windSpeed) || typeof temperature !== 'number' || isNaN(temperature)) {
    return null;
  }

  if (windSpeed < 8 && temperature < 15) {
    return {
      hasRisk: true,
      text: 'Low wind and a cold morning trap smoke near the ground'
    };
  }
  if (windSpeed < 8) {
    return {
      hasRisk: true,
      text: 'Calm winds prevent smoke dispersion, keeping local pollution elevated'
    };
  }
  if (temperature < 15) {
    return {
      hasRisk: false,
      text: 'Cold morning temperature, with light wind aiding gradual smoke dispersal'
    };
  }
  return {
    hasRisk: false,
    text: 'Moderate wind speed helps prevent stagnant smog accumulation'
  };
}

/**
 * Fetches current weather conditions from Google Maps Platform Weather API
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<object>}
 */
export async function getWeatherData(lat, lng) {
  const cacheKey = getWeatherCacheKey(lat, lng);
  const cached = weatherCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  if (!config.googleMapsApiKey) {
    const error = new Error('GOOGLE_MAPS_API_KEY is not configured on the server.');
    error.statusCode = 503;
    throw error;
  }

  const weatherUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=${lat}&location.longitude=${lng}`;
  const requestHeaders = {
    'X-Goog-Api-Key': config.googleMapsApiKey
  };

  const timeoutMs = 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(weatherUrl, {
      method: 'GET',
      headers: requestHeaders,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[Weather] Google Weather API request timed out after 10s');
      const timeoutError = new Error('Upstream weather service timed out. Please try again.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    console.error('[Weather] Upstream network fetch error:', err.message);
    const networkError = new Error('Failed to fetch weather data');
    networkError.statusCode = 502;
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`[Weather] Google Weather API error (${response.status}):`, errText);
    const error = new Error('Failed to fetch weather data');
    error.statusCode = 502;
    throw error;
  }

  const data = await response.json();
  const root = data.currentConditions || data;

  const rawTemp = root.temperature?.degrees ?? root.temperature?.value ?? (typeof root.temperature === 'number' ? root.temperature : null);
  const tempVal = rawTemp !== null ? Math.round(rawTemp) : null;

  const rawFeels = root.feelsLikeTemperature?.degrees ?? root.feelsLikeTemperature?.value ?? (typeof root.feelsLike === 'number' ? root.feelsLike : null);
  const feelsVal = rawFeels !== null ? Math.round(rawFeels) : null;

  const rawHumidity = root.relativeHumidity ?? root.humidity ?? null;
  const humidityVal = rawHumidity !== null ? Math.round(rawHumidity) : null;

  const rawWindSpeed = root.wind?.speed?.value ?? root.windSpeed?.value ?? (typeof root.windSpeed === 'number' ? root.windSpeed : null);
  const windSpeedVal = rawWindSpeed !== null ? Number(Number(rawWindSpeed).toFixed(1)) : null;

  const windDirVal = root.wind?.direction?.cardinal ?? root.wind?.direction?.degrees ?? root.windDirection ?? null;

  const rawUv = root.uvIndex ?? null;
  const uvVal = rawUv !== null ? Math.round(rawUv) : null;

  const conditionVal = root.weatherCondition?.description?.text ?? root.condition ?? null;

  const inversionRisk = (windSpeedVal !== null && tempVal !== null)
    ? getInversionRiskAnalysis(windSpeedVal, tempVal)
    : null;

  const result = {
    temperature: tempVal,
    feelsLike: feelsVal,
    humidity: humidityVal,
    windSpeed: windSpeedVal,
    windDirection: windDirVal ? String(windDirVal) : null,
    uvIndex: uvVal,
    condition: conditionVal ? String(conditionVal) : null,
    inversionRisk
  };

  weatherCache.set(cacheKey, result);
  return result;
}
