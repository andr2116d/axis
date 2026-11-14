import { metadataAxis } from '@/lib/metadata';
import { FlujoRevision } from '@/components/FlujoRevision';

export const metadata = metadataAxis('/revisar', 'Revisar expediente', 'Revisa un expediente técnico con Axis. Elige un ejemplo o carga tus archivos PDF para consultar observaciones y evidencia.');

export default function Revisar() {
  return <FlujoRevision />;
}
