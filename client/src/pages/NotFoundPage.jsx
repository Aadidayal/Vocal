import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center bg-[#f5f6fa] px-5 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">404 · Page not found</p>
      <h1 id="not-found-title" className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">That page isn’t here.</h1>
      <p className="mt-4 max-w-md leading-7 text-slate-600">The address may be incorrect, or this part of the workspace may not be available yet.</p>
      <Link className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-700" to="/">
        Return home
      </Link>
    </section>
  );
}
