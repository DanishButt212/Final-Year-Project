import {
  Briefcase,
  CalendarDays,
  GraduationCap,
  Landmark,
  LogIn,
  Receipt,
  Scale,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { roleHome } from '@/lib/navigation';

const FEATURES = [
  {
    icon: Briefcase,
    title: 'Electronic filing',
    text: 'File a case in a few guided steps, upload PDF pleadings and receive a Unique Case Number.',
  },
  {
    icon: Scale,
    title: 'Fair allocation',
    text: 'Cases are allocated to judges at random, and hearings can never double-book a judge or a lawyer.',
  },
  {
    icon: CalendarDays,
    title: 'Hearings and cause lists',
    text: 'See upcoming hearings and the daily cause list in one place.',
  },
  {
    icon: Receipt,
    title: 'Fees and receipts',
    text: 'Generate court fee challans, pay online and keep your receipts.',
  },
  {
    icon: GraduationCap,
    title: 'Chambers and interns',
    text: 'Lawyers manage clients, billable hours and legal interns from one chamber portal.',
  },
  {
    icon: ShieldCheck,
    title: 'Accountable by design',
    text: 'Every important action is written to an audit log that cannot be edited or deleted.',
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Landmark className="size-4" aria-hidden="true" />
            <span>Judicial ERP for the courts of Pakistan</span>
          </div>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold sm:text-4xl">
            Welcome to DigitalAdaalat
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-text-muted">
            DigitalAdaalat brings the court case lifecycle online: electronic filing, judge
            allocation, cause lists, hearings, summons delivery and lawyer chambers, all in one
            secure system for litigants, lawyers, interns, process servers, judges and court
            administrators.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Button asChild size="lg">
                <Link to={roleHome(user.role)}>Go to my dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link to="/login">
                    <LogIn aria-hidden="true" /> Log in
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/register">
                    <UserPlus aria-hidden="true" /> Register
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="features-heading" className="mx-auto max-w-6xl px-4 py-12">
        <h2 id="features-heading" className="text-2xl font-bold">
          What you can do
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Card className="h-full">
                <CardContent className="space-y-2">
                  <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-base font-bold">{title}</h3>
                  <p className="text-sm text-text-muted">{text}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
