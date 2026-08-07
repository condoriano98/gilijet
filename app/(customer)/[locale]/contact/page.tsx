import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Contact · Gilibali" };

export default function ContactPage() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-sky-700 hover:underline">
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Contact us</h1>
        <p className="mt-2 text-slate-600">
          We aim to respond to all inquiries within 24 hours.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer support</CardTitle>
              <CardDescription>Booking questions, refunds, cancellations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-slate-600">Email:</span>{" "}
                <a className="font-medium text-sky-700 hover:underline" href="mailto:info@balinusafast.com">
                  info@balinusafast.com
                </a>
              </div>
              <div>
                <span className="text-slate-600">WhatsApp:</span>{" "}
                <a className="font-medium text-sky-700 hover:underline" href="https://wa.me/628133399869">
                  +62 813-3399-869
                </a>
              </div>
              <div className="text-xs text-slate-500">
                Hours: 7 AM – 10 PM WITA, daily
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Privacy &amp; security</CardTitle>
              <CardDescription>Data requests, vulnerability reports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-slate-600">Email:</span>{" "}
                <a className="font-medium text-sky-700 hover:underline" href="mailto:info@balinusafast.com">
                  info@balinusafast.com
                </a>
              </div>
              <div className="text-xs text-slate-500">
                See our <Link href="/privacy" className="text-sky-700 hover:underline">Privacy Policy</Link>.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Registered office</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">CV Hi Bali Nusa Tenggara</p>
            <p className="text-slate-600">
              Jl. Swakarya Raya No.5B, Kekalik Jaya, Kec. Sekarbela, Kota
              Mataram, Nusa Tenggara Barat 83114, Indonesia
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
