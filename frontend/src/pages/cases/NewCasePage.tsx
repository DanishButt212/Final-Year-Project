import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PdfDropZone } from '@/components/ui/pdf-drop-zone';
import { ProgressBar } from '@/components/ui/progress';
import { Stepper } from '@/components/ui/stepper';
import { useFilingGate } from '@/hooks/use-filing-gate';
import { toast } from '@/components/ui/toaster';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { parseApiError } from '@/lib/api';
import { casesApi, type CreateCasePayload, type PartyPayload } from '@/lib/cases-api';
import { CASE_TYPES, caseTypeLabel } from '@/lib/case-status';
import { formatFileSize, formatPkr } from '@/lib/format';
import { PORTALS, portalPath } from '@/lib/navigation';
import {
  CASE_STEP_FIELDS,
  caseSchema,
  caseSummaryFor,
  type CaseValues,
  type PartyValues,
} from '@/lib/schemas';

const STEPS = ['Case details', 'Parties', 'Documents', 'Review & submit'];
const MAX_PARTIES = 10;
const emptyParty = (): PartyValues => ({ name: '', cnic: '', address: '', phone: '' });

/** Which wizard step a field belongs to (used to jump to the step that has errors). */
function stepOfField(name: string): number {
  if (name.startsWith('petitioners') || name.startsWith('respondents')) return 2;
  return 1;
}

function firstStepWithErrors(errors: FieldErrors<CaseValues>): number | null {
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;
  return Math.min(...keys.map(stepOfField));
}

const clean = (p: PartyValues): PartyPayload => ({
  name: p.name.trim(),
  ...(p.cnic.trim() ? { cnic: p.cnic.trim() } : {}),
  ...(p.phone.trim() ? { phone: p.phone.trim() } : {}),
  ...(p.address.trim() ? { address: p.address.trim() } : {}),
});

function PartyRows({
  name,
  label,
  control,
  register,
  errors,
}: {
  name: 'petitioners' | 'respondents';
  label: string;
  control: Control<CaseValues>;
  register: UseFormRegister<CaseValues>;
  errors: FieldErrors<CaseValues>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const listError = errors[name]?.root?.message ?? errors[name]?.message;

  return (
    <fieldset className="space-y-4">
      <legend className="font-heading text-lg font-bold">{label}</legend>
      {listError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {listError}
        </p>
      )}
      {fields.map((item, index) => {
        const e = errors[name]?.[index];
        const field = (key: keyof PartyValues) => `${name}.${index}.${key}` as Path<CaseValues>;
        return (
          <Card key={item.id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle as="h3" className="text-base">
                {label.replace(/s$/, '')} {index + 1}
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={fields.length === 1}
                onClick={() => remove(index)}
                aria-label={`Remove ${label.replace(/s$/, '').toLowerCase()} ${index + 1}`}
              >
                <Trash2 aria-hidden="true" /> Remove
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Full name" error={e?.name?.message} required>
                  {(p) => <Input autoComplete="off" {...p} {...register(field('name'))} />}
                </Field>
              </div>
              <Field
                label="CNIC (optional)"
                hint="Format: 12345-1234567-1"
                error={e?.cnic?.message}
              >
                {(p) => (
                  <Input
                    inputMode="numeric"
                    placeholder="12345-1234567-1"
                    {...p}
                    {...register(field('cnic'))}
                  />
                )}
              </Field>
              <Field
                label="Mobile number (optional)"
                hint="Format: +92 3XX XXXXXXX"
                error={e?.phone?.message}
              >
                {(p) => (
                  <Input
                    type="tel"
                    placeholder="+92 300 1234567"
                    {...p}
                    {...register(field('phone'))}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address (optional)" error={e?.address?.message}>
                  {(p) => <Input {...p} {...register(field('address'))} />}
                </Field>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        disabled={fields.length >= MAX_PARTIES}
        onClick={() => append(emptyParty())}
      >
        <Plus aria-hidden="true" /> Add {label.replace(/s$/, '').toLowerCase()}
      </Button>
    </fieldset>
  );
}

function ReviewParties({ title, parties }: { title: string; parties: PartyValues[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">{title}</h3>
      <ul className="mt-1 space-y-1">
        {parties.map((p, i) => (
          <li key={i}>
            <span className="font-medium">{p.name}</span>
            <span className="text-sm text-text-muted">
              {[p.cnic, p.phone, p.address]
                .filter(Boolean)
                .map((v) => ` · ${v}`)
                .join('')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewCaseWizard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [attempted, setAttempted] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ id: string; ucn: string; message: string } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    trigger,
    setError,
    getValues,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CaseValues>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      caseType: undefined,
      title: '',
      reliefSought: '',
      claimAmountPkr: '',
      // A litigant files as the first petitioner; a lawyer files on behalf of a client.
      petitioners: [
        user?.role === 'LITIGANT'
          ? {
              name: `${user.firstName} ${user.lastName}`,
              cnic: user.cnic,
              address: '',
              phone: user.phone,
            }
          : emptyParty(),
      ],
      respondents: [emptyParty()],
    },
  });
  const caseTypeValue = useWatch({ control, name: 'caseType' });
  const claimValue = useWatch({ control, name: 'claimAmountPkr' });

  const dirty = !result && (isDirty || files.length > 0);
  const leaveDialog = useUnsavedChangesGuard(dirty);

  if (!user) return null;
  const portal = PORTALS[user.role];
  const portfolioPath = portalPath(portal, 'cases');

  const stepFields: readonly (keyof CaseValues)[] = CASE_STEP_FIELDS[step as 1 | 2] ?? [];
  const stepHasErrors = stepFields.some((f) => errors[f]);

  async function goNext() {
    setAttempted(true);
    setFormError(null);
    const ok = stepFields.length === 0 ? true : await trigger([...stepFields]);
    if (!ok) return;
    setAttempted(false);
    setStep((s) => Math.min(4, s + 1));
  }

  function goBack() {
    setAttempted(false);
    setFormError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function jumpToErrors(errs: FieldErrors<CaseValues>) {
    const target = firstStepWithErrors(errs);
    if (target) {
      setStep(target);
      setAttempted(true);
    }
  }

  async function onValid(values: CaseValues) {
    setFormError(null);
    setFileError(null);
    setProgress(0);
    const payload: CreateCasePayload = {
      caseType: values.caseType,
      ...(values.title.trim() ? { title: values.title.trim() } : {}),
      reliefSought: values.reliefSought.trim(),
      ...(values.caseType === 'CIVIL_SUIT' && values.claimAmountPkr?.trim()
        ? { claimAmountPkr: values.claimAmountPkr.trim() }
        : {}),
      petitioners: values.petitioners.map(clean),
      respondents: values.respondents.map(clean),
    };
    try {
      const res = await casesApi.create(payload, files, setProgress);
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success(res.message);
      setResult({ id: res.case.id, ucn: res.case.ucn, message: res.message });
    } catch (error) {
      setProgress(null);
      const body = parseApiError(error);
      setFormError(body.message);
      if (body.code === 'INVALID_FILE') {
        setFileError(body.message);
        setStep(3);
        return;
      }
      for (const d of body.details ?? []) {
        if (/^(caseType|title|reliefSought|petitioners|respondents)/.test(d.field)) {
          setError(d.field as Path<CaseValues>, { type: 'server', message: d.messages[0] });
        }
      }
      if (body.details?.length) {
        setStep(Math.min(...body.details.map((d) => stepOfField(d.field))));
        setAttempted(true);
      }
    }
  }

  function onInvalid(errs: FieldErrors<CaseValues>) {
    setFormError(caseSummaryFor(errs));
    jumpToErrors(errs);
  }

  // ---------------------------------------------------------------- success

  if (result) {
    return (
      <>
        <PageHeader
          title="New Case Submission"
          crumbs={[
            { label: 'Dashboard', to: portalPath(portal, '') },
            { label: 'New Case Submission' },
          ]}
        />
        <Card className="max-w-2xl">
          <CardContent className="space-y-5 text-center">
            <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden="true" />
            <div role="status">
              <h2 className="text-xl font-bold">{result.message}</h2>
              <p className="mt-1 text-text-muted">
                Your case is registered and is pending assignment to a judge. Keep this number for
                all future reference.
              </p>
            </div>
            <div className="rounded-lg border-2 border-primary bg-primary-soft px-4 py-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                Unique Case Number
              </p>
              <p
                className="case-number mt-1 break-all text-2xl font-medium text-primary sm:text-3xl"
                data-testid="ucn"
              >
                {result.ucn}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to={`${portfolioPath}/${result.id}`}>Open case</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to={portfolioPath}>Go to My Case Portfolio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // ---------------------------------------------------------------- wizard

  const values = getValues();
  const submitting = isSubmitting || progress !== null;

  return (
    <>
      <PageHeader
        title="New Case Submission"
        description="Fill in the four steps below. Nothing is saved until you submit on the last step."
        crumbs={[
          { label: 'Dashboard', to: portalPath(portal, '') },
          { label: 'New Case Submission' },
        ]}
      />
      {leaveDialog}
      <Stepper steps={STEPS} current={step} />

      <form noValidate onSubmit={handleSubmit(onValid, onInvalid)} className="max-w-3xl space-y-6">
        {(formError || (attempted && stepHasErrors)) && (
          <Alert variant="error">{formError ?? caseSummaryFor(errors)}</Alert>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Case details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Case type" error={errors.caseType?.message} required>
                {(p) => (
                  <NativeSelect defaultValue="" {...p} {...register('caseType')}>
                    <option value="" disabled>
                      Select a case type
                    </option>
                    {CASE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field
                label="Case title (optional)"
                hint="Leave empty and we will use “Petitioner vs. Respondent”."
                error={errors.title?.message}
              >
                {(p) => <Input {...p} {...register('title')} />}
              </Field>
              <Field
                label="Relief sought"
                hint="Explain what you are asking the court to decide. At least 20 characters."
                error={errors.reliefSought?.message}
                required
              >
                {(p) => <Textarea rows={6} {...p} {...register('reliefSought')} />}
              </Field>
              {caseTypeValue === 'CIVIL_SUIT' && (
                <Field
                  label="Claim value (PKR, optional)"
                  hint={
                    claimValue && /^\d{1,12}(\.\d{1,2})?$/.test(claimValue)
                      ? `${formatPkr(claimValue)}. Used to calculate the claim value part of the court fee.`
                      : 'The value of your claim. Used to calculate the claim value part of the court fee.'
                  }
                  error={errors.claimAmountPkr?.message}
                >
                  {(p) => (
                    <Input
                      inputMode="decimal"
                      placeholder="1850000"
                      {...p}
                      {...register('claimAmountPkr')}
                    />
                  )}
                </Field>
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <div className="space-y-8">
            <PartyRows
              name="petitioners"
              label="Petitioners"
              control={control}
              register={register}
              errors={errors}
            />
            <PartyRows
              name="respondents"
              label="Opposing parties"
              control={control}
              register={register}
              errors={errors}
            />
          </div>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <p className="text-sm text-text-muted">
                Attach petitions, statements and affidavits as PDF. Once the case is submitted,
                documents are locked to the case number and cannot be changed or deleted. This step
                is optional; you can add documents later.
              </p>
            </CardHeader>
            <CardContent>
              <PdfDropZone
                files={files}
                onFilesChange={(next) => {
                  setFileError(null);
                  setFiles(next);
                }}
                serverError={fileError}
              />
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Review and submit</CardTitle>
              <p className="text-sm text-text-muted">
                Check everything carefully. You can go back to change any step.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-text-muted">Case type</dt>
                  <dd className="font-medium">
                    {values.caseType ? caseTypeLabel(values.caseType) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">Case title</dt>
                  <dd className="font-medium">
                    {values.title.trim() ||
                      `${values.petitioners[0]?.name || '…'}${values.petitioners.length > 1 ? ' & others' : ''} vs. ${values.respondents[0]?.name || '…'}${values.respondents.length > 1 ? ' & others' : ''}`}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm text-text-muted">Relief sought</dt>
                  <dd className="whitespace-pre-wrap break-words">{values.reliefSought}</dd>
                </div>
                {values.caseType === 'CIVIL_SUIT' && values.claimAmountPkr?.trim() && (
                  <div>
                    <dt className="text-sm text-text-muted">Claim value</dt>
                    <dd>{formatPkr(values.claimAmountPkr)}</dd>
                  </div>
                )}
              </dl>
              <ReviewParties title="Petitioners" parties={values.petitioners} />
              <ReviewParties title="Opposing parties" parties={values.respondents} />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
                  Documents
                </h3>
                {files.length === 0 ? (
                  <p className="text-text-muted">No documents attached.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {files.map((f) => (
                      <li key={`${f.name}-${f.size}`} className="break-words">
                        {f.name}{' '}
                        <span className="text-sm text-text-muted">({formatFileSize(f.size)})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {progress !== null && <ProgressBar value={progress} label="Uploading your case" />}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={goBack}
            disabled={step === 1 || submitting}
          >
            <ArrowLeft aria-hidden="true" /> Back
          </Button>
          {step < 4 ? (
            <Button type="button" onClick={goNext}>
              Next <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" loading={submitting} disabled={submitting}>
              <Send aria-hidden="true" /> Submit case
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

/** Shows why filing is unavailable (unverified lawyer, registration closed) instead of the wizard. */
export default function NewCasePage() {
  const { user } = useAuth();
  const gate = useFilingGate();
  if (!user || gate.canFile) return <NewCaseWizard />;
  const portal = PORTALS[user.role];
  return (
    <>
      <PageHeader
        title="New Case Submission"
        crumbs={[
          { label: 'Dashboard', to: portalPath(portal, '') },
          { label: 'New Case Submission' },
        ]}
      />
      <Alert variant="info" title="New filing unavailable">
        {gate.reason}
      </Alert>
    </>
  );
}
