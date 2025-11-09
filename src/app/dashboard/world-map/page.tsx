
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { geoMercator } from 'd3-geo';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Loader2 } from 'lucide-react';

function HexWorldMap({ baseHexRadius = 2, scaleFactor = 1 }: { baseHexRadius?: number; scaleFactor?: number }) {
  const [geoData, setGeoData] = useState<any>(null);
  const [validHexes, setValidHexes] = useState<[number, number][]>([]);
  const [selectedHex, setSelectedHex] = useState<number | null>(null);
  const lastClickRef = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
        setDimensions({
            width: containerRef.current.offsetWidth,
            height: containerRef.current.offsetHeight,
        });
    }
    const handleResize = () => {
        if(containerRef.current) {
            setDimensions({
                width: containerRef.current.offsetWidth,
                height: containerRef.current.offsetHeight,
            })
        }
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load world data once
  useEffect(() => {
    try {
      const countries = topojson.feature(world, world.objects.countries as any);
      setGeoData(countries);
    } catch (err) {
      console.error('Failed to convert topojson to geojson', err);
    }
  }, []);

  // Generate hexes efficiently with memoization
  const hexGrid = useMemo(() => {
    if (!geoData || dimensions.width === 0 || dimensions.height === 0) return [];

    const { width, height } = dimensions;
    
    // Use fitExtent to automatically scale and center the projection
    const projection = geoMercator().fitExtent(
      [
        [0, 0],
        [width, height]
      ],
      geoData
    );

    const adjustedHexRadius = Math.max(1, baseHexRadius * scaleFactor);
    const xStep = adjustedHexRadius * 1.5;
    const yStep = Math.sqrt(3) * adjustedHexRadius;

    const hexes: [number, number][] = [];
    const features = geoData.features;

    for (let y = 0; y < height; y += yStep) {
      const row = Math.round(y / yStep);
      for (let x = 0; x < width; x += xStep) {
        const xOff = row % 2 ? x + xStep / 2 : x;
        const inverted = projection.invert([xOff, y]);
        if (!inverted) continue;

        const [lon, lat] = inverted;
        if (lon === undefined || lat === undefined) continue;

        const isOnLand = features.some((f: any) => {
          if (!f.bbox) f.bbox = d3.geoBounds(f);
          const [[minLon, minLat], [maxLon, maxLat]] = f.bbox;
          if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return false;
          return d3.geoContains(f, [lon, lat]);
        });

        if (isOnLand) hexes.push([xOff, y]);
      }
    }
    return hexes;
  }, [geoData, dimensions, baseHexRadius, scaleFactor]);

  useEffect(() => {
    if (hexGrid.length) setValidHexes(hexGrid);
  }, [hexGrid]);

  const handleHexClick = (index: number) => {
    const now = Date.now();
    if (now - lastClickRef.current < 150) return;
    lastClickRef.current = now;
    setSelectedHex(index);
  };

  const hexPoints = (cx: number, cy: number, r: number) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return pts.join(' ');
  };
  
  const { width, height } = dimensions;

  if (!geoData) return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /> <span className="ml-2">Loading map data...</span></div>;
  if (!validHexes.length) return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /> <span className="ml-2">Preparing map...</span></div>;

  const adjustedHexRadius = Math.max(1, baseHexRadius * scaleFactor * 0.95);

  return (
    <div ref={containerRef} style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'hsl(var(--background))'}}>
      <div style={{width:'100%', height:'100%', borderRadius: 'var(--radius)', overflow:'hidden', border: '1px solid hsl(var(--border))', boxShadow:'0 6px 20px rgba(0,0,0,0.05)'}}>
        <TransformWrapper minScale={0.5} maxScale={10} initialScale={1.8} centerOnInit>
          <TransformComponent>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              style={{width:'100%', height:'100%', display:'block', background: 'hsl(var(--muted)/0.2)'}}
            >
              {validHexes.map(([x, y], i) => (
                <polygon
                  key={i}
                  points={hexPoints(x, y, adjustedHexRadius)}
                  fill="hsl(var(--background))"
                  stroke={selectedHex === i ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                  strokeWidth={0.4}
                  onClick={() => handleHexClick(i)}
                  className="cursor-pointer transition-all duration-150 hover:fill-primary/20"
                />
              ))}
            </svg>
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
}

export default function WorldMapPage() {
    return <HexWorldMap baseHexRadius={4}/>;
}
