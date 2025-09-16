import { TestTube } from 'lucide-react';

export function Header() {
  return (
    <header className="p-4 border-b bg-card shadow-sm">
      <div className="container mx-auto flex items-center gap-4">
        <TestTube className="w-8 h-8 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">
          Insight Extractor
        </h1>
      </div>
    </header>
  );
}
