import { redirect } from "next/navigation";
import Link from "next/link";
import { getOperatorSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Step1BasicInfo } from "./step-1-basic-info";
import { Step2Siup } from "./step-2-siup";
import { Step3Npwp } from "./step-3-npwp";
import { Step4VesselLicense } from "./step-4-vessel-license";
import { Step5Insurance } from "./step-5-insurance";
import { Step6CaptainLicense } from "./step-6-captain-license";
import { Step7BankAccount } from "./step-7-bank-account";

const STEPS = [
  { number: 1, title: "Basic Information", description: "Company details" },
  { number: 2, title: "SIUP", description: "Business permit" },
  { number: 3, title: "NPWP", description: "Tax ID" },
  { number: 4, title: "Vessel License", description: "Boat license" },
  { number: 5, title: "Insurance", description: "Insurance certificate" },
  { number: 6, title: "Captain License", description: "Captain certification" },
  { number: 7, title: "Bank Account", description: "Payment details" },
];

// Uses getOperatorSession() directly instead of requireOperator(): step 1
// has no session yet (the account doesn't exist until createOperatorAccount
// runs), so an unconditional redirect-to-login would make step 1
// unreachable. Steps 2+ still require a session via the checks below.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  const session = await getOperatorSession();
  const { step: stepParam, error } = await searchParams;
  const currentStep = Math.max(1, Math.min(7, Number(stepParam) || 1));

  if (!session && currentStep > 1) {
    redirect("/operator/daftar?step=1");
  }

  if (session && currentStep === 1) {
    redirect("/operator/daftar?step=2");
  }

  const operator = session
    ? await prisma.operator.findUnique({
        where: { id: session.sub },
        include: {
          documents: true,
        },
      })
    : null;

  if (!operator && session) {
    redirect("/operator/login");
  }

  function renderStep() {
    switch (currentStep) {
      case 1:
        return <Step1BasicInfo error={error} />;
      case 2:
        return operator ? <Step2Siup operator={operator} /> : null;
      case 3:
        return operator ? <Step3Npwp operator={operator} /> : null;
      case 4:
        return operator ? <Step4VesselLicense operator={operator} /> : null;
      case 5:
        return operator ? <Step5Insurance operator={operator} /> : null;
      case 6:
        return operator ? <Step6CaptainLicense operator={operator} /> : null;
      case 7:
        return operator ? <Step7BankAccount operator={operator} /> : null;
      default:
        return null;
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Operator Registration</h1>
          <p className="mt-2 text-muted-foreground">
            7-step verification process (KYB)
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => (
              <div key={s.number} className="flex flex-1 items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                    s.number <= currentStep
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {s.number}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      s.number < currentStep ? "bg-emerald-600" : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2 text-center text-sm">
            {STEPS.map((s) => (
              <div key={s.number}>
                <div className="font-semibold">{s.title}</div>
                <div className="text-xs text-muted-foreground">{s.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Current Step Content */}
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
            <CardDescription>
              Step {currentStep} of {STEPS.length}
            </CardDescription>
          </CardHeader>
          <CardContent>{renderStep()}</CardContent>
        </Card>

        {/* Navigation */}
        <div className="mt-8 flex justify-between">
          {currentStep > 1 ? (
            <Link
              href={`/operator/daftar?step=${currentStep - 1}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          {currentStep === 7 ? (
            <Link href="/operator" className={cn(buttonVariants())}>
              Go to Dashboard
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
