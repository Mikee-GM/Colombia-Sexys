import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-black px-6 text-center">
      <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#C5A55A]/60">
        Error 404
      </span>
      <h1 className="font-heading text-3xl font-semibold tracking-wide text-white sm:text-4xl">
        Esta pagina no existe
      </h1>
      <p className="max-w-md text-sm font-light leading-relaxed text-zinc-500">
        El enlace que seguiste no lleva a ningun lado o el contenido ya no esta
        publicado.
      </p>
      <Link
        href="/"
        className="border border-[#C5A55A] px-6 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black"
      >
        Volver al catalogo
      </Link>
    </main>
  );
}
