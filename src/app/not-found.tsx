import Link from 'next/link';
import { EstadoVacio } from '@/components/ui';

export default function NoEncontrada() {
  return <div className="py-10"><EstadoVacio principal titulo="Esta página no existe" texto="Puede que el enlace esté incompleto. Desde la portada puedes revisar un expediente o probar con un ejemplo."><Link href="/" className="boton-principal">Ir a la portada</Link></EstadoVacio></div>;
}
