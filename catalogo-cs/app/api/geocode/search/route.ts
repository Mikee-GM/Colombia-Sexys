import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface GeocodePlaceResult {
  placeId: number | string;
  lat: number;
  lng: number;
  displayName: string;
  name?: string;
  type?: string;
  road?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const encoded = encodeURIComponent(query);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&addressdetails=1&limit=8`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "ColombiaSexys-ERP/1.0 (contact@colombiasexys.com)",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Error al consultar servicio de mapas" },
        { status: res.status },
      );
    }

    const data = await res.json();

    const results: GeocodePlaceResult[] = (data || []).map((item: any) => {
      const addr = item.address || {};
      return {
        placeId: item.place_id,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        displayName: item.display_name,
        name: item.name || item.display_name.split(",")[0],
        type: item.type || item.class,
        road: addr.road || addr.pedestrian || addr.street,
        city: addr.city || addr.town || addr.municipality || addr.village,
        state: addr.state,
        country: addr.country,
        postcode: addr.postcode,
      };
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("Geocoding search error:", error);
    return NextResponse.json(
      { error: "Error de conexión con el servicio de geocodificación" },
      { status: 500 },
    );
  }
}
