'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe } from 'lucide-react';
import React from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';

// URL to the TopoJSON file for world geography
const geoUrl =
  'https://raw.githubusercontent.com/deldersveld/topojson/master/world-countries.json';

export default function WorldMapPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6" />
          <CardTitle>World Map</CardTitle>
        </div>
        <CardDescription>
          Visualize your passages, visited countries, and ports all over the world. Pan and zoom on the map.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
          <ComposableMap
            projection="geoMercator"
            style={{ width: '100%', height: '100%' }}
          >
            <ZoomableGroup center={[0, 0]} zoom={1}>
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
                        hover: { fill: 'hsl(var(--primary))', outline: 'none' },
                        pressed: { fill: 'hsl(var(--primary))', outline: 'none' },
                      }}
                    />
                  ))
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
        </div>
      </CardContent>
    </Card>
  );
}
