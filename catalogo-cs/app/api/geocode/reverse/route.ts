import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Latitud y longitud requeridas" },
      { status: 400 },
    );
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    return NextResponse.json(
      { error: "Coordenadas inválidas" },
      { status: 400 },
    );
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lngNum}&format=json&addressdetails=1`;

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
    const addr = data.address || {};

    // Formatear una dirección limpia y legible
    const streetParts = [
      addr.road || addr.pedestrian || addr.street,
      addr.house_number,
    ].filter(Boolean);

    const subParts = [
      addr.neighbourhood || addr.suburb,
      addr.city || addr.town || addr.municipality || addr.village,
      addr.state,
    ].filter(Boolean);

    const cleanStreet = streetParts.join(" ");
    const cleanDetails = subParts.join(", ");
    const recommendedAddress = [cleanStreet, cleanDetails].filter(Boolean).join(", ");

    return NextResponse.json({
      placeId: data.place_id,
      lat: latNum,
      lng: lngNum,
      displayName: data.display_name,
      recommendedAddress: recommendedAddress || data.display_name,
      address: addr,
    });
  } catch (error) {
    console.error("Geocoding reverse error:", error);
    return NextResponse.json(
      { error: "Error de conexión con el servicio de geocodificación inversa" },
      { status: 500 },
    );
  }
}
