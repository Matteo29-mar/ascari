import axios from "axios";

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN!;

export async function geocodeAddress(locationText: string, city?: string) {
  const query = encodeURIComponent(
    city ? `${locationText}, ${city}` : locationText
  );

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json`;

  const { data } = await axios.get(url, {
    params: {
      access_token: MAPBOX_TOKEN,
      limit: 1,
    },
  });

  if (!data.features || data.features.length === 0) {
    return null;
  }

  const [lng, lat] = data.features[0].center;

  return { lat, lng };
}
