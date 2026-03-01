import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACE_TEXT_SEARCH_URL =
  'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACE_DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';

export interface GeocodeResult {
  lat: number;
  lng: number;
}

export interface PlaceSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
}

export interface PlaceDetailsResult {
  website?: string;
  opening_hours?: { open_now?: boolean; weekday_text?: string[] };
  price_level?: number;
}

@Injectable()
export class GooglePlacesService {
  private readonly apiKey: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY');
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  /**
   * Convert city + country to coordinates for location biasing.
   */
  async geocode(city: string, country: string): Promise<GeocodeResult | null> {
    if (!this.apiKey) return null;
    const address = [city, country].filter(Boolean).join(', ');
    if (!address.trim()) return null;

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{
          status: string;
          results?: Array<{
            geometry?: { location?: { lat: number; lng: number } };
          }>;
        }>(GEOCODE_URL, {
          params: { address, key: this.apiKey },
          timeout: 8000,
        }),
      );
      if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location)
        return null;
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    } catch {
      return null;
    }
  }

  /**
   * Text Search: real venues matching the query, biased to the given location.
   */
  async textSearch(
    query: string,
    lat: number,
    lng: number,
    options?: { radiusMeters?: number; language?: string },
  ): Promise<PlaceSearchResult[]> {
    if (!this.apiKey) return [];
    const radius = options?.radiusMeters ?? 3000;
    const language = options?.language ?? 'en';

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{
          status: string;
          results?: Array<{
            place_id: string;
            name?: string;
            formatted_address?: string;
            geometry?: { location?: { lat: number; lng: number } };
            rating?: number;
            user_ratings_total?: number;
            price_level?: number;
          }>;
        }>(PLACE_TEXT_SEARCH_URL, {
          params: {
            query,
            key: this.apiKey,
            location: `${lat},${lng}`,
            radius,
            language,
          },
          timeout: 8000,
        }),
      );
      if (data.status !== 'OK' || !Array.isArray(data.results)) return [];
      return data.results.slice(0, 5).map((r) => ({
        place_id: r.place_id,
        name: r.name ?? 'Unknown',
        formatted_address: r.formatted_address ?? '',
        lat: r.geometry?.location?.lat ?? lat,
        lng: r.geometry?.location?.lng ?? lng,
        rating: r.rating,
        user_ratings_total: r.user_ratings_total,
        price_level: r.price_level,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Place Details: fetch website and optional fields for a place.
   */
  async getPlaceDetails(
    placeId: string,
    fields: string = 'website,opening_hours,price_level',
  ): Promise<PlaceDetailsResult | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{
          status: string;
          result?: {
            website?: string;
            opening_hours?: { open_now?: boolean; weekday_text?: string[] };
            price_level?: number;
          };
        }>(PLACE_DETAILS_URL, {
          params: { place_id: placeId, fields, key: this.apiKey },
          timeout: 5000,
        }),
      );
      if (data.status !== 'OK' || !data.result) return null;
      return {
        website: data.result.website,
        opening_hours: data.result.opening_hours,
        price_level: data.result.price_level,
      };
    } catch {
      return null;
    }
  }
}
