import Image from "next/image";
import PropertyForm from "@/components/PropertyForm";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-6">
          <Image
            src="/homeblurb-logo.svg"
            alt="HomeBlurb"
            width={40}
            height={26}
            className="h-10 w-auto"
            priority
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-brand-ink">
              HomeBlurb
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Give us the address and a few details — we&apos;ll write the
              listing.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <PropertyForm />
      </main>

      <footer className="border-t border-neutral-200 bg-white py-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://www.megapixeler.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-brand-green px-4 py-2 text-sm font-medium text-brand-green-deep hover:bg-brand-green/10"
            >
              Visit our Website
            </a>
            <a
              href="https://share.google/YwCNqJKWkjPyehwjH"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-brand-green px-4 py-2 text-sm font-medium text-brand-green-deep hover:bg-brand-green/10"
            >
              Read our Reviews
            </a>
            <a
              href="https://www.megapixeler.com/#ordernow"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-green-deep"
            >
              Book a Photoshoot
            </a>
          </div>

          <a
            href="https://www.megapixeler.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-neutral-400"
          >
            <span>Photography &amp; HomeBlurb by</span>
            <Image
              src="/megapixeler-logo.png"
              alt="Megapixeler"
              width={1500}
              height={828}
              className="h-6 w-auto"
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
