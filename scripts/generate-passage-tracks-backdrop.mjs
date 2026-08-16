#!/usr/bin/env node
/**
 * Regenerates src/data/passage-tracks-backdrop.ts from world-atlas + d3-geo.
 * Run: node scripts/generate-passage-tracks-backdrop.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const topojson = require('topojson-client');
const { geoNaturalEarth1, geoPath, geoGraticule10 } = require('d3-geo');
const landTopo = require('world-atlas/land-110m.json');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 1200;
const HEIGHT = 620;
const land = topojson.feature(landTopo, landTopo.objects.land);
const projection = geoNaturalEarth1()
  .rotate([-8, 0])
  .fitExtent([[24, 28], [WIDTH - 24, HEIGHT - 20]], land);
const geoPathFn = geoPath(projection);
const landPath = geoPathFn(land);
const graticulePath = geoPathFn(geoGraticule10());

const TRACKS = [
  { id: 'med', color: '#38bdf8', points: [[-5.8,36.1],[2.6,39.5],[7.1,43.5],[14.3,40.8],[23.7,37.9],[28.9,36.9]] },
  { id: 'caribbean', color: '#f59e0b', points: [[-64.9,18.3],[-61.8,17.1],[-61.0,14.6],[-60.9,13.8],[-59.6,13.1]] },
  { id: 'north', color: '#a78bfa', points: [[-1.4,50.9],[4.5,52.4],[8.0,55.0],[10.7,59.9],[5.3,60.4],[18.1,59.3]] },
  { id: 'atlantic', color: '#2dd4bf', points: [[-17.1,28.1],[-25.0,25.0],[-40.0,20.0],[-55.0,18.5],[-64.9,18.3]] },
];

function densify(points, steps = 12) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [lon0, lat0] = points[i];
    const [lon1, lat1] = points[i + 1];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([lon0 + (lon1 - lon0) * t, lat0 + (lat1 - lat0) * t]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const tracks = TRACKS.map((track) => {
  const coords = densify(track.points).map((ll) => projection(ll)).filter(Boolean);
  const d = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return { id: track.id, color: track.color, d, coords };
});

const endpoints = tracks.flatMap((t) => {
  if (t.coords.length < 2) return [];
  const start = t.coords[0];
  const end = t.coords[t.coords.length - 1];
  return [
    { x: +start[0].toFixed(1), y: +start[1].toFixed(1), color: t.color },
    { x: +end[0].toFixed(1), y: +end[1].toFixed(1), color: t.color },
  ];
});

const out = {
  width: WIDTH,
  height: HEIGHT,
  landPath,
  graticulePath,
  tracks: tracks.map(({ id, color, d }) => ({ id, color, d })),
  endpoints,
};

const file = `/**
 * Pre-projected SVG geometry for the landing passage-tracks backdrop.
 * Generated from world-atlas land-110m + d3-geo Natural Earth — no runtime JSON import
 * (Turbopack HMR breaks on world-atlas/*.json).
 *
 * Regenerate: node scripts/generate-passage-tracks-backdrop.mjs
 */
export const PASSAGE_TRACKS_BACKDROP = ${JSON.stringify(out)} as const;
`;

const dest = path.join(__dirname, '../src/data/passage-tracks-backdrop.ts');
fs.writeFileSync(dest, file);
console.log('Wrote', dest, '(' + file.length + ' bytes)');
