import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BestPriceGuaranteePage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Home
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-display font-bold">
              Best Price Guarantee
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-700">
            <p>
              We believe you should always get the best deal. If you find a
              lower price for the <strong>same operator, route, and departure
              date</strong> on another platform within 24 hours of booking,
              we&apos;ll credit the difference as a Gilijet voucher.
            </p>

            <h2 className="text-base font-semibold text-slate-900">
              How it works
            </h2>
            <ol className="list-inside list-decimal space-y-2">
              <li>Book your trip on Gilijet as usual.</li>
              <li>
                If you spot a lower price elsewhere for the identical sailing,
                take a screenshot showing the operator name, route, date, and
                total price.
              </li>
              <li>
                Contact us within 24 hours of your booking via WhatsApp
                (+62 812 3456 7890) or email (support@gilijet.com) with the
                screenshot and your booking reference.
              </li>
              <li>
                We&apos;ll verify the price within one business day. If it
                matches, we&apos;ll credit the difference to your Gilijet
                account as a voucher for your next trip.
              </li>
            </ol>

            <h2 className="text-base font-semibold text-slate-900">
              Terms
            </h2>
            <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
              <li>
                The competing price must be publicly listed and bookable by
                the general public (no member-only or agent-only rates).
              </li>
              <li>
                The comparison is on the total fare per passenger in IDR,
                including any booking fees.
              </li>
              <li>
                Voucher credit is capped at Rp 50,000 or 20% of the original
                fare, whichever is lower.
              </li>
              <li>
                Cannot be combined with promotional codes or group discounts.
              </li>
              <li>
                Gilijet reserves the right to modify or discontinue this
                guarantee at any time.
              </li>
            </ul>

            <div className="pt-4">
              <Button asChild>
                <Link href="/search">Search routes</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
