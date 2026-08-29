"use client";

import LocationPickerMap from "./LocationPickerMap";

export default function TransportLocationMap({
  latitude,
  longitude,
  onChange,
  address,
  onAddressChange,
}: {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
  address?: string;
  onAddressChange?: (address: string) => void;
}) {
  return (
    <LocationPickerMap
      latitude={latitude}
      longitude={longitude}
      onChange={(lat, lng) => onChange(lat, lng)}
      address={address}
      onAddressChange={onAddressChange}
      heightClass="h-64"
    />
  );
}

