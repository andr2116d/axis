import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <section className="page-lead">
      <h1>No encontramos esta página</h1>
      <p>La revisión pudo haberse borrado o el enlace está incompleto.</p>
      <p><Link className="text-link" href="/">Volver al inicio</Link></p>
    </section>
  );
}
