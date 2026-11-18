import type { Metadata } from 'next';

// AXIS_DOMINIO: dominio público fuera de Vercel (p. ej. el de CloudFront en AWS, ver infra/).
const dominio = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || process.env.AXIS_DOMINIO;
const origen = dominio ? new URL('https://' + dominio) : new URL('http://localhost:' + (process.env.PORT || '3000'));

export function metadataAxis(ruta: string, pagina: string, description: string): Metadata {
  const title = ruta === '/' ? 'Axis · El eje que mantiene todo en su lugar' : pagina + ' · Axis';
  const image = new URL('/axis-compartir.png', origen);
  return {
    metadataBase: origen,
    title,
    description,
    applicationName: 'Axis',
    ...(dominio && { alternates: { canonical: new URL(ruta, origen) } }),
    openGraph: {
      type: 'website', siteName: 'Axis', locale: 'es_PE', title, description,
      ...(dominio && { url: new URL(ruta, origen) }),
      images: [{ url: image, width: 1200, height: 630, alt: 'Axis. El eje que mantiene todo en su lugar.' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}
