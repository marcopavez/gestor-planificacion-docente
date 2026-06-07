// apps/web/app/layout.tsx — layout raíz de Next.js App Router

export const metadata = {
  title: 'Faro — Copiloto de planificación docente',
  description: 'Genera documentos pedagógicos alineados al currículum y normativa MINEDUC.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
