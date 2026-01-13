// lib/places/getPlaceMapImage.ts
// Resolve a place map image path with normalization for public/images assets.

export function getPlaceMapImage(place: any): string | null {
  const img =
    place?.map?.image ??
    place?.image ??
    place?.assets?.map ??
    place?.assets?.image ??
    null;

  if (typeof img !== 'string' || !img.trim()) return null;

  // Normalize "images/foo.png" -> "/images/foo.png" for public assets.
  if (img.startsWith('images/')) return `/${img}`;

  return img;
}
