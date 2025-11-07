'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe } from 'lucide-react';
import React, { useState, MouseEvent } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Line,
  Marker,
  Sphere,
} from 'react-simple-maps';
import { geoOrthographic } from 'd3-geo';

const geoUrl = 'https://raw.githubusercontent.com/deldersveld/topojson/master/world-countries.json';

// Example data
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

export default function WorldMapPage() {
  const [rotation, setRotation] = useState<[number, number]>([0, -20]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (event: MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (isDragging) {
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      const newRotation: [number, number] = [rotation[0] + dx * 0.25, rotation[1] - dy * 0.25];
      setRotation(newRotation);
      setDragStart({ x: event.clientX, y: event.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  const projection = geoOrthographic()
    .scale(250)
    .translate([400, 300])
    .rotate(rotation);


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6" />
          <CardTitle>Interactive World Map</CardTitle>
        </div>
        <CardDescription>
          Visualize your passages, visited countries, and ports. Click and drag the globe to rotate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div 
          className="relative aspect-video w-full overflow-hidden rounded-lg border"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <ComposableMap
            projection={projection}
            style={{ width: '100%', height: 'auto' }}
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
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="hsl(var(--muted))"
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
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}

            {markers.map(({ name, coordinates }) => (
              <Marker key={name} coordinates={coordinates}>
                <circle r={4} fill="hsl(var(--accent))" stroke="#FFF" strokeWidth={1} />
                <text
                  textAnchor="middle"
                  y={-10}
                  style={{ fontFamily: 'system-ui', fill: 'hsl(var(--foreground))', fontSize: '10px', fontWeight: 'bold' }}
                >
                  {name}
                </text>
              </Marker>
            ))}

          </ComposableMap>
        </div>
      </CardContent>
    </Card>
  );
}
