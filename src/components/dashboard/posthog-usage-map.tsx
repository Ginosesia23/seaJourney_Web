'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';

import type { PostHogAnalytics, PostHogLocatedPerson } from '@/lib/posthog';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

function placeLabel(city?: string, country?: string): string {
  return [city, country].filter(Boolean).join(', ') || 'Unknown';
}

function jitter(
  lat: number,
  lng: number,
  index: number,
  total: number,
  zoom: number,
): [number, number] {
  if (total <= 1) return [lng, lat];
  const angle = (index / total) * Math.PI * 2;
  const radius = (0.12 + (index % 3) * 0.05) / Math.max(zoom, 1);
  return [lng + Math.cos(angle) * radius, lat + Math.sin(angle) * radius * 0.55];
}

export function PostHogUsageMap({
  locations,
  locatedPeople,
}: {
  locations: PostHogAnalytics['locations'];
  locatedPeople: PostHogLocatedPerson[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const maxUsers = Math.max(1, ...locations.map((l) => l.users));
  const inv = 1 / Math.max(zoom, 1);
  const showPeople = zoom >= 1.6;
  const showLabels = zoom >= 3.2;

  const peopleByPlace = useMemo(() => {
    const map = new Map<string, PostHogLocatedPerson[]>();
    for (const person of locatedPeople) {
      const key = `${person.lat.toFixed(2)},${person.lng.toFixed(2)}`;
      const list = map.get(key) ?? [];
      list.push(person);
      map.set(key, list);
    }
    return map;
  }, [locatedPeople]);

  const selectedPeople = selectedKey ? peopleByPlace.get(selectedKey) ?? [] : [];
  const selectedPlace = locations.find(
    (l) => `${l.lat.toFixed(2)},${l.lng.toFixed(2)}` === selectedKey,
  );

  if (locations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No GeoIP locations yet. PostHog fills city/country from IP once events start arriving.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="overflow-hidden rounded-lg border bg-muted/20">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 120, center: [10, 20] }}
          className="h-[360px] w-full"
          style={{ width: '100%', height: 360 }}
        >
          <ZoomableGroup
            minZoom={1}
            maxZoom={12}
            onMove={({ zoom: nextZoom }) => {
              if (Math.abs(nextZoom - zoom) > 0.04) setZoom(nextZoom);
            }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="hsl(var(--muted))"
                    stroke="hsl(var(--border))"
                    strokeWidth={0.4 * inv}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', fill: 'hsl(var(--muted-foreground) / 0.25)' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>
            {locations.map((loc) => {
              const key = `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}`;
              const r = (5 + (loc.users / maxUsers) * 12) * inv;
              const active = selectedKey === key;
              return (
                <Marker key={key} coordinates={[loc.lng, loc.lat]}>
                  <circle
                    r={Math.max(2.2 * inv, r)}
                    fill="hsl(var(--primary))"
                    fillOpacity={active ? 0.95 : showPeople ? 0.45 : 0.7}
                    stroke="hsl(var(--background))"
                    strokeWidth={1.2 * inv}
                    className="cursor-pointer"
                    onClick={() => setSelectedKey((cur) => (cur === key ? null : key))}
                  />
                </Marker>
              );
            })}
            {showPeople &&
              locatedPeople.map((person, i) => {
                const placeKey = `${person.lat.toFixed(2)},${person.lng.toFixed(2)}`;
                const siblings = peopleByPlace.get(placeKey) ?? [person];
                const index = siblings.findIndex((p) => p.distinctId === person.distinctId);
                const [lng, lat] = jitter(
                  person.lat,
                  person.lng,
                  Math.max(0, index),
                  siblings.length,
                  zoom,
                );
                const label = person.matchedUser?.name || person.email || 'Anonymous';
                return (
                  <Marker key={`${person.distinctId}-${i}`} coordinates={[lng, lat]}>
                    <circle
                      r={3.1 * inv}
                      fill={
                        person.matchedUser
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--muted-foreground))'
                      }
                      stroke="hsl(var(--background))"
                      strokeWidth={0.9 * inv}
                      className="cursor-pointer"
                      onClick={() => setSelectedKey(placeKey)}
                    >
                      <title>
                        {label} — {placeLabel(person.city, person.country)}
                      </title>
                    </circle>
                    {showLabels ? (
                      <text
                        textAnchor="start"
                        x={5 * inv}
                        y={1.5 * inv}
                        fontSize={9 * inv}
                        fill="hsl(var(--foreground))"
                        stroke="hsl(var(--background))"
                        strokeWidth={2.4 * inv}
                        paintOrder="stroke"
                        style={{ pointerEvents: 'none' }}
                      >
                        {label}
                      </text>
                    ) : null}
                  </Marker>
                );
              })}
          </ZoomableGroup>
        </ComposableMap>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          City-level from IP (not GPS). Scroll to zoom — dots stay sized to the view, and names appear when close.
        </p>
      </div>

      <div className="rounded-lg border px-3 py-3">
        {selectedPlace ? (
          <>
            <div className="text-sm font-medium">
              {placeLabel(selectedPlace.city, selectedPlace.country)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedPlace.users} {selectedPlace.users === 1 ? 'person' : 'people'} ·{' '}
              {selectedPlace.events} events
            </p>
            <div className="mt-3 space-y-2">
              {selectedPeople.length === 0 ? (
                <p className="text-xs text-muted-foreground">No identified people for this city in the sample.</p>
              ) : (
                selectedPeople.map((person) => (
                  <div key={person.distinctId} className="min-w-0">
                    {person.matchedUser ? (
                      <Link
                        href={`/dashboard/users/${person.matchedUser.id}`}
                        className="block truncate text-xs font-medium hover:underline"
                      >
                        {person.matchedUser.name}
                      </Link>
                    ) : (
                      <div className="truncate text-xs text-muted-foreground">
                        {person.email || 'Anonymous'}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      {person.events} events
                      {person.matchedUser?.role ? ` · ${person.matchedUser.role}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Click a marker to see who was using the app from that city.
          </p>
        )}
      </div>
    </div>
  );
}
