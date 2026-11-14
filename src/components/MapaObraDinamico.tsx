'use client';
import dynamic from 'next/dynamic';
export const MapaObraDinamico = dynamic(() => import('./MapaObra'), { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded-sm bg-concreto-oscuro" /> });
