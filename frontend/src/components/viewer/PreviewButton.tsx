import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useViewer, type PreviewFile } from './viewer-context';

/** "Preview" (eye icon) next to a Download button: opens the PDF viewer or the image lightbox. */
export function PreviewButton({
  file,
  label: text,
  iconOnly = false,
  size = 'sm',
  variant = 'secondary',
  className,
}: {
  file: PreviewFile;
  /** Visible text; defaults to "Preview". */
  label?: string;
  iconOnly?: boolean;
  size?: 'sm' | 'default';
  variant?: 'secondary' | 'ghost';
  className?: string;
}) {
  const { t } = useTranslation();
  const { open } = useViewer();
  const label = t('Preview {{name}}', { name: file.name });
  return (
    <Button
      type="button"
      size={iconOnly ? 'icon' : size}
      variant={variant}
      onClick={() => open(file)}
      aria-label={iconOnly ? label : undefined}
      title={label}
      className={cn(iconOnly && 'size-9', className)}
    >
      <Eye aria-hidden="true" />
      {!iconOnly && (text ?? t('Preview'))}
    </Button>
  );
}
