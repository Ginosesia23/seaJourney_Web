import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import CrewDashboard from '@/components/sections/crew-dashboard';

export default function ForVesselsPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#02162c' }}>
      <Header />
      <main className="flex-1">
        <CrewDashboard />
      </main>
      <Footer />
    </div>
  );
}




