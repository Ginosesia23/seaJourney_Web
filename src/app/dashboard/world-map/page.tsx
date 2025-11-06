'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe } from 'lucide-react';
import Image from 'next/image';

export default function WorldMapPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6" />
          <CardTitle>World Map</CardTitle>
        </div>
        <CardDescription>
          Visualize your passages, visited countries, and ports all over the world.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
          <Image
            src="https://picsum.photos/seed/worldmap/1200/675"
            alt="World Map Placeholder"
            fill
            className="object-cover"
            data-ai-hint="world map"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-2xl font-bold text-white">Interactive Map Coming Soon</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
