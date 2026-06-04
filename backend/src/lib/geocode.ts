import axios from "axios";

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN!;

export async function geocodeAddress(locationText: string, city?: string) {
  const queryText = city ? `${locationText}, ${city}, Italy` : `${locationText}, Italy`;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    queryText
  )}.json`;

  const { data } = await axios.get(url, {
    params: {
      access_token: MAPBOX_TOKEN,
      limit: 1,
      country: "it",
      language: "it",
      types: "address,place,locality,postcode",
    },
  });

  if (!data.features || data.features.length === 0) {
    console.warn("[GEOCODE] Nessun risultato per:", queryText);
    return null;
  }

  const [lng, lat] = data.features[0].center;

  console.log("[GEOCODE] Risultato:", {
    queryText,
    lat,
    lng,
    place_name: data.features[0].place_name,
  });

  return { lat, lng };
}