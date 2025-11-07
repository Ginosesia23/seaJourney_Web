
'use client';

import { Globe, Map } from 'lucide-react';
import React, { useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Line,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const geoUrl = 'https://raw.githubusercontent.com/deldersveld/topojson/master/world-countries.json';

const markers = [
  { name: 'Fort Lauderdale', coordinates: [-80.1373, 26.1224] as [number, number] },
  { name: 'Monaco', coordinates: [7.4246, 43.7384] as [number, number] },
  { name: 'Palma de Mallorca', coordinates: [2.6502, 39.5696] as [number, number] },
  { name: 'Antigua', coordinates: [-61.7964, 17.0608] as [number, number] },
];

const passages = [
  { from: [-80.1373, 26.1224], to: [-61.7964, 17.0608] },
  { from: [-61.7964, 17.0608], to: [2.6502, 39.5696] },
  { from: [2.6502, 39.5696], to: [7.4246, 43.7384] },
];

type Viewport = {
  center: [number, number];
  zoom: number;
}

const regions = {
  World: { center: [0, 20] as [number, number], zoom: 1 },
  "The Med": { center: [10, 40] as [number, number], zoom: 4 },
  "North America": { center: [-100, 40] as [number, number], zoom: 2 },
  Caribbean: { center: [-75, 15] as [number, number], zoom: 4 },
  "South Pacific": { center: [-150, -20] as [number, number], zoom: 2 },
};

type RegionKey = keyof typeof regions;

const MapContent = ({ zoom = 1 }: { zoom?: number }) => (
  <>
    <Geographies geography={geoUrl}>
      {({ geographies }) =>
        geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill="hsl(var(--card))"
            stroke="hsl(var(--background))"
            style={{
              default: { outline: 'none' },
              hover: { fill: 'hsl(var(--primary) / 0.5)', outline: 'none' },
              pressed: { fill: 'hsl(var(--primary))', outline: 'none' },
            }}
          />
        ))
      }
    </Geographies>
    {passages.map((line, i) => (
      <Line
        key={`line-${i}`}
        from={line.from}
        to={line.to}
        stroke="hsl(var(--primary))"
        strokeWidth={2 / zoom}
        strokeLinecap="round"
      />
    ))}
    {markers.map(({ name, coordinates }) => (
      <Marker key={name} coordinates={coordinates}>
        <circle r={4 / zoom} fill="hsl(var(--accent))" stroke="#FFF" strokeWidth={1 / zoom} />
        <text
          textAnchor="middle"
          y={-8 / zoom}
          style={{ 
            fontFamily: 'system-ui', 
            fill: 'hsl(var(--foreground))', 
            fontSize: `${10 / zoom}px`, 
            fontWeight: 'bold' 
          }}
        >
          {name}
        </text>
      </Marker>
    ))}
  </>
);

export default function WorldMapPage() {
  const [viewport, setViewport] = useState<Viewport>(regions.World);
  const [activeRegion, setActiveRegion] = useState<RegionKey>('World');

  const handleRegionChange = (regionKey: RegionKey) => {
    setViewport(regions[regionKey]);
    setActiveRegion(regionKey);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Map className="h-6 w-6" />
              <CardTitle>Interactive World Map</CardTitle>
            </div>
            <CardDescription className="mt-2">
              Visualize your passages, visited countries, and ports.
            </CardDescription>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(regions) as RegionKey[]).map(key => (
                <Button 
                    key={key}
                    variant={activeRegion === key ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleRegionChange(key)}
                    className="rounded-full"
                >
                    {key}
                </Button>
            ))}
        </div>
      </div>
      <div
        className="relative flex-1 w-full overflow-hidden rounded-lg border bg-background"
      >
          <ComposableMap
            projection="geoMercator"
            style={{ width: '100%', height: '100%' }}
            width={800}
            height={600}
          >
            <ZoomableGroup center={viewport.center} zoom={viewport.zoom}>
                <Graticule stroke="hsl(var(--border))" strokeWidth={0.5} />
                <MapContent zoom={viewport.zoom} />
            </ZoomableGroup>
          </ComposableMap>
      </div>
    </div>
  );
}
