/**
 * Geolocation & Google Places Autocomplete Integration
 * Safely initialises Google Places if an API key is available from the backend,
 * or gracefully falls back to browser HTML5 Geolocation and city presets.
 */

import { fetchConfig } from './api.js';

let autocompleteInstance = null;

export async function initPlacesAutocomplete(inputElement, onPlaceSelected) {
  if (!inputElement) return;

  try {
    const { mapsApiKey } = await fetchConfig();
    if (!mapsApiKey) {
      console.info('[Saans Geo] No Google Maps browser key returned from backend. Using manual city selection.');
      return;
    }

    // Load Google Maps script if not already loaded
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      await loadGoogleMapsScript(mapsApiKey);
    }

    if (window.google && window.google.maps && window.google.maps.places) {
      autocompleteInstance = new window.google.maps.places.Autocomplete(inputElement, {
        componentRestrictions: { country: 'in' },
        fields: ['geometry', 'name', 'formatted_address']
      });

      autocompleteInstance.addListener('place_changed', () => {
        const place = autocompleteInstance.getPlace();
        if (place && place.geometry && place.geometry.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const name = place.name || place.formatted_address || 'Selected Location';
          onPlaceSelected({ lat, lng, name });
        }
      });
    }
  } catch (err) {
    console.warn('[Saans Geo] Could not initialise Places Autocomplete:', err);
  }
}

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-script');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps script failed to load'));
    document.head.appendChild(script);
  });
}

/**
 * HTML5 Browser Geolocation with clean error handling
 */
export function getCurrentCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: 'Your Current Location'
        });
      },
      (err) => {
        let msg = 'Unable to retrieve your location.';
        if (err.code === 1) msg = 'Location permission denied. Please select your city manually.';
        else if (err.code === 2) msg = 'Location unavailable. Please select your city manually.';
        else if (err.code === 3) msg = 'Location request timed out.';
        reject(new Error(msg));
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  });
}
