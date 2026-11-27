'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icono } from '../Icono';
import { SelectorArchivos, enviar } from '../SelectorArchivos';

// Documentos que el ganador presenta para firmar el contrato (experiencia, constancias).

export function VerificarContrato({ procesoId, ganador, subidaDirecta, hecho }: { procesoId: string; ganador: string; subidaDirecta: boolean; hecho: boolean }) {
  const router = useRouter();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');

  const verificar = async () => {
    setError('');
    try {
      await enviar(`/api/procesos/${procesoId}/contrato`, archivos, {}, subidaDirecta, setProgreso);
      setArchivos([]);
      router.refresh();
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setProgreso('');
    }
  };

  return (
    <div className="verificar-contrato">
      <p>Antes de firmar, {ganador} acredita lo que declaró bajo juramento: su experiencia (Anexo 11) con constancias o actas de recepción. Súbelas y Axis las coteja con la oferta y con el SEACE.</p>
      <SelectorArchivos archivos={archivos} alCambiar={setArchivos} titulo={hecho ? 'Subir más documentos del ganador' : 'Arrastra los documentos del ganador'} ayuda="Anexo 11, constancias, actas de recepción" />
      {error && <p className="form-error" role="alert">{error}</p>}
      {archivos.length > 0 && <div className="upload-actions"><button type="button" className="btn primary" disabled={!!progreso} onClick={verificar}><Icono nombre={progreso ? 'clock' : 'check'} tamano={18} />{progreso || 'Verificar documentos'}</button></div>}
    </div>
  );
}
