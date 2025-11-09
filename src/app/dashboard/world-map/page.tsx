
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { geoMercator } from 'd3-geo';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Loader2, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { hexbin as d3Hexbin } from 'd3-hexbin';

type Passage = [number, number][]; // Array of [lon, lat] coordinates

function HexWorldMap({ baseHexRadius = 2, scaleFactor = 1, passageData }: { baseHexRadius?: number; scaleFactor?: number; passageData?: Passage }) {
  const [geoData, setGeoData] = useState<any>(null);
  const [validHexes, setValidHexes] = useState<[number, number][]>([]);
  const [selectedHex, setSelectedHex] = useState<number | null>(null);
  const lastClickRef = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
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

  // Generate hexes and path efficiently with memoization
  useEffect(() => {
    if (!geoData || dimensions.width === 0 || dimensions.height === 0) return;
    
    setIsLoading(true);

    const generateMap = () => {
        const { width, height } = dimensions;
        
        const projection = geoMercator().fitExtent(
          [
            [0, 0],
            [width, height]
          ],
          geoData
        );

        const adjustedHexRadius = Math.max(1, baseHexRadius * scaleFactor);
        
        const hexbin = d3Hexbin()
            .radius(adjustedHexRadius)
            .extent([[0, 0], [width, height]]);

        const points: [number, number][] = [];
        for (let i = 0; i < geoData.features.length; i++) {
            const feature = geoData.features[i];
            const coordinates = d3.geoCentroid(feature);
            if (d3.geoContains(feature, coordinates)) {
                // Add more points for larger polygons to get better coverage
                 const step = 0.5;
                 const bounds = d3.geoBounds(feature);
                 for (let lon = bounds[0][0]; lon < bounds[1][0]; lon += step) {
                     for (let lat = bounds[0][1]; lat < bounds[1][1]; lat += step) {
                         if (d3.geoContains(feature, [lon, lat])) {
                             const p = projection([lon, lat]);
                             if (p) points.push(p);
                         }
                     }
                 }
            }
        }
        
        const hexes = hexbin(points);
        setValidHexes(hexes.map(h => [h.x, h.y]));

        // Generate passage path
        if (passageData) {
            const lineGenerator = d3.line().context(null);
            const projectedPoints = passageData.map(d => projection(d) as [number, number]);
            const svgPath = lineGenerator(projectedPoints);
            setPath(svgPath);
        }

        setIsLoading(false);
    }
    
    const timer = setTimeout(generateMap, 100);
    return () => clearTimeout(timer);

  }, [geoData, dimensions, baseHexRadius, scaleFactor, passageData]);


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
  const adjustedHexRadius = Math.max(1, baseHexRadius * scaleFactor * 0.95);

  return (
    <div ref={containerRef} className="h-full w-full relative">
       {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Preparing map...</span>
        </div>
      )}
      <div className={cn("h-full w-full transition-opacity duration-500", isLoading ? "opacity-0" : "opacity-100")}>
        <TransformWrapper minScale={0.5} maxScale={10} initialScale={1.8} centerOnInit>
           {({ zoomIn, zoomOut }) => (
            <>
              <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  preserveAspectRatio="none"
                  style={{width:'100%', height:'100%', display:'block', background: 'hsl(var(--card))'}}
                >
                  {validHexes.map(([x, y], i) => (
                    <polygon
                      key={i}
                      points={hexPoints(x, y, adjustedHexRadius)}
                      fill={selectedHex === i ? 'hsl(var(--primary))' : 'hsl(var(--muted))'}
                      stroke="hsl(var(--border) / 0.5)"
                      strokeWidth={0.4}
                      onClick={() => handleHexClick(i)}
                      className="cursor-pointer transition-all duration-150 hover:fill-primary/20"
                    />
                  ))}
                  {path && (
                      <path
                        d={path}
                        stroke="hsl(var(--accent))"
                        strokeWidth="2"
                        fill="none"
                        strokeDasharray="4 4"
                        className="animate-pulse"
                      />
                  )}
                </svg>
              </TransformComponent>
              <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                <Button onClick={() => zoomIn()} size="icon" variant="outline" className="rounded-full shadow-lg">
                  <Plus />
                </Button>
                <Button onClick={() => zoomOut()} size="icon" variant="outline" className="rounded-full shadow-lg">
                  <Minus />
                </Button>
              </div>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}

export default function WorldMapPage() {
    // Sample passage from Italy to Miami
    const passage: Passage = [
        [12.8, 42.8],    // Italy
        [5.3, 43.3],     // Marseille
        [-5.3, 36.1],    // Strait of Gibraltar
        [-15.0, 32.6],   // Madeira
        [-25.0, 28.0],   // Mid-Atlantic
        [-50.0, 25.0],   // Approaching Caribbean
        [-70.0, 26.0],   // Bahamas
        [-80.1, 25.7],   // Miami
    ];

    return <HexWorldMap baseHexRadius={4} passageData={passage} />;
}
