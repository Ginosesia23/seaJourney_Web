import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import CrewDashboard from '@/components/sections/crew-dashboard';
import AISImport from '@/components/sections/ais-import';

export default function ForVesselsPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#000b15' }}>
      <Header />
      <main className="flex-1">
        <CrewDashboard />
        <AISImport />
      </main>
      <Footer />
    </div>
  );
}








