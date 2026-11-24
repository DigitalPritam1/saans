/**
 * Geolocation & Google Places Autocomplete Integration
 *
 * Adheres to Google Maps JavaScript API Modern Places Library:
 * - Uses PlaceAutocompleteElement when available
 * - Loads Maps script lazily only on user interaction / search focus
 * - Never shows typed city with another city's data (shows inline error if not found)
 * - Safe fallback to Indian city database when offline or API key absent
 */

import { fetchConfig } from './api.js';

let mapsLoadingPromise = null;

export const INDIAN_CITIES = [
  { name: 'Delhi NCR', lat: 28.6139, lng: 77.2090 },
  { name: 'Noida', lat: 28.5355, lng: 77.3910 },
  { name: 'Gurugram', lat: 28.4595, lng: 77.0266 },
  { name: 'Faridabad', lat: 28.4089, lng: 77.3178 },
  { name: 'Ghaziabad', lat: 28.6692, lng: 77.4538 },
  { name: 'Mumbai', lat: 19.0760, lng: 72.8777 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Lucknow', lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur', lat: 26.4499, lng: 80.3319 },
  { name: 'Patna', lat: 25.5941, lng: 85.1376 },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { name: 'Hyderabad', lat: 17.3850, lng: 78.4867 },
  { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Varanasi', lat: 25.3176, lng: 82.9739 },
  { name: 'Agra', lat: 27.1767, lng: 78.0081 }
];

export function findKnownCity(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.trim().toLowerCase();
  return INDIAN_CITIES.find(c => c.name.toLowerCase() === q || c.name.toLowerCase().includes(q)) || null;
}

/**
 * Lazily loads Google Maps JS script
 */
export async function loadGoogleMaps() {
  if (window.google?.maps) return window.google.maps;
  if (mapsLoadingPromise) return mapsLoadingPromise;

  mapsLoadingPromise = (async () => {
    try {
      const { mapsApiKey } = await fetchConfig();
      if (!mapsApiKey) return null;

      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey)}&libraries=places&v=weekly&loading=async`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google Maps script failed to load'));
        document.head.appendChild(script);
      });

      return window.google?.maps || null;
    } catch (err) {
      console.warn('[Saans Geo] Google Maps loading failed:', err.message);
      return null;
    }
  })();

  return mapsLoadingPromise;
}

/**
 * Initializes Places Autocomplete with PlaceAutocompleteElement or fallback
 * @param {HTMLElement} containerOrInput
 * @param {function} onPlaceSelected - ({ lat, lng, name }) => void
 * @param {function} onError - (errorMessage) => void
 */
export function initPlacesAutocomplete(containerOrInput, onPlaceSelected, onError) {
  if (!containerOrInput) return;

  const triggerLazyLoad = async () => {
    const maps = await loadGoogleMaps();
    if (!maps) return;

    try {
      // Modern PlaceAutocompleteElement
      if (maps.places?.PlaceAutocompleteElement) {
        // If element is a container, create PlaceAutocompleteElement
        if (containerOrInput.tagName !== 'INPUT') {
          containerOrInput.innerHTML = '';
          const autocomplete = new maps.places.PlaceAutocompleteElement({
            componentRestrictions: { country: ['in'] }
          });
          autocomplete.id = 'gmp-autocomplete-instance';
          containerOrInput.appendChild(autocomplete);

          autocomplete.addEventListener('gmp-placeselect', async (e) => {
            const place = e.place;
            if (!place) return;
            try {
              await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress'] });
              if (place.location) {
                const lat = place.location.lat();
                const lng = place.location.lng();
                const name = place.displayName || place.formattedAddress || 'Selected City';
                onPlaceSelected({ lat, lng, name });
              }
            } catch (_err) {
              if (onError) onError('Could not fetch place coordinates. Please try again.');
            }
          });
          return;
        }
      }

      // Fallback to legacy Autocomplete if input is HTMLInputElement
      if (containerOrInput.tagName === 'INPUT' && maps.places?.Autocomplete) {
        const legacyAuto = new maps.places.Autocomplete(containerOrInput, {
          componentRestrictions: { country: 'in' },
          fields: ['geometry', 'name', 'formatted_address']
        });
        legacyAuto.addListener('place_changed', () => {
          const place = legacyAuto.getPlace();
          if (place?.geometry?.location) {
            onPlaceSelected({
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              name: place.name || place.formatted_address || 'Selected City'
            });
          } else {
            if (onError) onError('Please select a valid city from the suggested list.');
          }
        });
      }
    } catch (e) {
      console.warn('[Saans Geo] Autocomplete init exception:', e);
    }
  };

  // Lazy load only when user interacts with search box
  containerOrInput.addEventListener('focus', triggerLazyLoad, { once: true });
  containerOrInput.addEventListener('click', triggerLazyLoad, { once: true });
}

/**
 * Browser HTML5 Geolocation with clean, user-friendly errors
 */
export function getCurrentCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser. Please search for your city.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: +pos.coords.latitude.toFixed(4),
          lng: +pos.coords.longitude.toFixed(4),
          name: 'Your Current Location'
        });
      },
      (err) => {
        let msg = 'Unable to retrieve your location.';
        if (err.code === 1) msg = 'Location access was denied. Please select your city from the list.';
        else if (err.code === 2) msg = 'Location information is unavailable. Please select your city.';
        else if (err.code === 3) msg = 'Location request timed out. Please try again or select your city.';
        reject(new Error(msg));
      },
      { timeout: 8000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  });
}
