'use client';

import { Globe, Map } from 'lucide-react';
import React, { useState, MouseEvent } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Line,
  Marker,
  Sphere,
  ZoomableGroup,
} from 'react-simple-maps';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

type MapView = 'globe' | 'flat';
type Viewport = {
  center: [number, number];
  zoom: number;
  rotation: [number, number];
}

const regions = {
  World: { center: [0, 20] as [number, number], zoom: 1, rotation: [0, -20] as [number, number] },
  "The Med": { center: [10, 40] as [number, number], zoom: 4, rotation: [-10, -40] as [number, number] },
  "North America": { center: [-100, 40] as [number, number], zoom: 2, rotation: [100, -40] as [number, number] },
  Caribbean: { center: [-75, 15] as [number, number], zoom: 4, rotation: [75, -15] as [number, number] },
  "South Pacific": { center: [-150, -20] as [number, number], zoom: 2, rotation: [150, 20] as [number, number] },
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
  const [mapView, setMapView] = useState<MapView>('globe');
  const [viewport, setViewport] = useState<Viewport>(regions.World);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeRegion, setActiveRegion] = useState<RegionKey>('World');

  const handleRegionChange = (regionKey: RegionKey) => {
    setViewport(regions[regionKey]);
    setActiveRegion(regionKey);
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (mapView !== 'globe') return;
    setIsDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (isDragging && mapView === 'globe') {
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      const newRotation: [number, number] = [viewport.rotation[0] + dx * 0.25, viewport.rotation[1] - dy * 0.25];
      setViewport(prev => ({...prev, rotation: newRotation}));
      setDragStart({ x: event.clientX, y: event.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Globe className="h-6 w-6" />
              <CardTitle>Interactive World Map</CardTitle>
            </div>
            <CardDescription className="mt-2">
              Visualize your passages, visited countries, and ports. Click and drag the globe to rotate.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={mapView === 'globe' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMapView('globe')}
            >
              <Globe className="mr-2 h-4 w-4" />
              Globe View
            </Button>
            <Button
              variant={mapView === 'flat' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMapView('flat')}
            >
              <Map className="mr-2 h-4 w-4" />
              Flat View
            </Button>
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: mapView === 'globe' && isDragging ? 'grabbing' : mapView === 'globe' ? 'grab' : 'default' }}
      >
        {mapView === 'globe' ? (
          <ComposableMap
            projection="geoOrthographic"
            projectionConfig={{
                rotate: viewport.rotation,
                scale: 300
            }}
            style={{ width: '100%', height: '100%' }}
            width={800}
            height={600}
          >
            <Sphere
                id="rsm-sphere"
                stroke="hsl(var(--border))"
                strokeWidth={0.5}
                fill="hsl(var(--background))"
            />
            <Graticule stroke="hsl(var(--border))" strokeWidth={0.25} />
            <MapContent />
          </ComposableMap>
        ) : (
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
        )}
      </div>
    </div>
  );
}
