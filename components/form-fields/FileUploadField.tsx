'use client';

import * as React from 'react';

import {
  AudioLines,
  FileIcon,
  ImageIcon,
  Loader2,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { useUploadThing } from '@/utils/uploadthing';

export type UploadedFileValue = {
  key: string;
  name: string;
  url: string;
  size: number;
  type: string;
};

type UploadMode = 'image' | 'audio' | 'media' | 'file';

type FileUploadFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label: React.ReactNode;
  mode?: UploadMode;
  description?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  showRequiredAsterisk?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  accept?: string;
  className?: string;
  emptyText?: string;
  buttonText?: string;
};

type UploadFieldBodyProps = {
  id: string;
  mode: UploadMode;
  value: UploadedFileValue[];
  onChange: (value: UploadedFileValue[]) => void;
  onBlur: () => void;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  multiple: boolean;
  maxFiles: number;
  accept: string;
  emptyText: string;
  buttonText: string;
};

function RequiredAsterisk({
  required,
  show,
}: {
  required: boolean;
  show: boolean;
}) {
  if (!required || !show) return null;

  return (
    <>
      <span
        className='text-destructive ml-1'
        aria-hidden='true'
      >
        *
      </span>
      <span className='sr-only'>Required</span>
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 bytes';

  const units = ['bytes', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const size = bytes / 1024 ** unitIndex;

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

const IMAGE_FILE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

function isImageFile(file: UploadedFileValue): boolean {
  const type = file.type.toLowerCase();

  if (type.startsWith('image/')) return true;
  if (IMAGE_FILE_EXTENSIONS.has(type)) return true;

  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension ? IMAGE_FILE_EXTENSIONS.has(extension) : false;
}

const AUDIO_FILE_EXTENSIONS = new Set([
  'aac',
  'flac',
  'm4a',
  'mp3',
  'ogg',
  'wav',
  'webm',
]);
const VIDEO_FILE_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'ogv', 'webm']);

function fileExtension(file: UploadedFileValue): string {
  return file.name.split('.').pop()?.toLowerCase() ?? file.type.toLowerCase();
}

function isAudioFile(file: UploadedFileValue): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith('audio/')) return true;
  return (
    AUDIO_FILE_EXTENSIONS.has(type) ||
    AUDIO_FILE_EXTENSIONS.has(fileExtension(file))
  );
}

function isVideoFile(file: UploadedFileValue): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith('video/')) return true;
  return (
    VIDEO_FILE_EXTENSIONS.has(type) ||
    VIDEO_FILE_EXTENSIONS.has(fileExtension(file))
  );
}

function normalizeUploadedFile(file: {
  key: string;
  name: string;
  size: number;
  type?: string;
  url?: string;
  ufsUrl?: string;
  serverData?: { url?: string } | null;
}): UploadedFileValue {
  const url = file.ufsUrl ?? file.url ?? file.serverData?.url;

  if (!url) {
    throw new Error('UploadThing did not return a file URL.');
  }

  return {
    key: file.key,
    name: file.name,
    url,
    size: file.size,
    type:
      file.type?.toLowerCase() ??
      file.name.split('.').pop()?.toLowerCase() ??
      'file',
  };
}

function UploadFieldBody({
  id,
  mode,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
  multiple,
  maxFiles,
  accept,
  emptyText,
  buttonText,
}: UploadFieldBodyProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const valueRef = React.useRef(value);

  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handleUploadComplete = React.useCallback(
    (
      result: Array<{
        key: string;
        name: string;
        size: number;
        type?: string;
        url?: string;
        ufsUrl?: string;
        serverData?: { url?: string } | null;
      }>
    ) => {
      try {
        const uploadedFiles = result.map(normalizeUploadedFile);
        const currentValue = valueRef.current;

        onChange(
          multiple
            ? [...currentValue, ...uploadedFiles].slice(0, maxFiles)
            : uploadedFiles.slice(0, 1)
        );

        onBlur();
        setUploadError(null);
        setProgress(100);
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? error.message
            : 'The upload completed, but the response was invalid.'
        );
      } finally {
        window.setTimeout(() => setProgress(0), 500);

        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    },
    [maxFiles, multiple, onBlur, onChange]
  );

  const uploadOptions = {
    uploadProgressGranularity: 'fine' as const,
    onClientUploadComplete: handleUploadComplete,
    onUploadProgress: (nextProgress: number) => {
      setProgress(nextProgress);
    },
    onUploadError: (error: Error) => {
      setUploadError(error.message);
      setProgress(0);

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    onUploadAborted: () => {
      setUploadError('The upload was canceled.');
      setProgress(0);

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
  };

  const imageUploader = useUploadThing('imageUploader', uploadOptions);
  const audioUploader = useUploadThing('audioUploader', uploadOptions);
  const mediaUploader = useUploadThing('feedMediaUploader', uploadOptions);
  const fileUploader = useUploadThing('fileUploader', uploadOptions);

  const uploader =
    mode === 'image'
      ? imageUploader
      : mode === 'audio'
        ? audioUploader
        : mode === 'media'
          ? mediaUploader
          : fileUploader;
  const isUploading = uploader.isUploading;
  const remainingSlots = Math.max(maxFiles - value.length, 0);
  const canAddFiles = remainingSlots > 0 && !disabled && !isUploading;

  async function uploadSelectedFiles(selectedFiles: File[]) {
    setUploadError(null);

    const files = selectedFiles.slice(0, multiple ? remainingSlots : 1);

    if (files.length === 0) return;

    if (
      mode === 'image' &&
      files.some((file) => !file.type.startsWith('image/'))
    ) {
      setUploadError('Only image files are allowed.');
      return;
    }

    if (
      mode === 'audio' &&
      files.some((file) => !file.type.startsWith('audio/'))
    ) {
      setUploadError('Only audio files are allowed.');
      return;
    }

    if (
      mode === 'media' &&
      files.some(
        (file) =>
          !file.type.startsWith('image/') &&
          !file.type.startsWith('audio/') &&
          !file.type.startsWith('video/')
      )
    ) {
      setUploadError('Only image, audio, and video files are allowed.');
      return;
    }

    setProgress(1);

    try {
      uploader.startUpload(files);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'The upload failed.'
      );
      setProgress(0);

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  function removeFile(key: string) {
    onChange(value.filter((file) => file.key !== key));
    onBlur();
  }

  return (
    <div className='grid gap-3'>
      <input
        ref={inputRef}
        id={id}
        type='file'
        className='sr-only'
        accept={accept}
        multiple={multiple}
        disabled={!canAddFiles}
        onChange={(event) => {
          void uploadSelectedFiles(Array.from(event.target.files ?? []));
        }}
      />

      <div
        role='button'
        tabIndex={canAddFiles ? 0 : -1}
        aria-disabled={!canAddFiles}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          'flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center',
          'focus-visible:border-ring focus-visible:ring-ring/50 transition-colors outline-none focus-visible:ring-[3px]',
          isDragging && 'border-primary bg-primary/5',
          invalid && 'border-destructive',
          !canAddFiles && 'cursor-not-allowed opacity-60'
        )}
        onClick={() => canAddFiles && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (canAddFiles && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (canAddFiles) setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);

          if (canAddFiles) {
            void uploadSelectedFiles(Array.from(event.dataTransfer.files));
          }
        }}
      >
        <div className='bg-muted flex size-11 items-center justify-center rounded-full'>
          {isUploading ? (
            <Loader2
              className='size-5 animate-spin'
              aria-hidden='true'
            />
          ) : mode === 'image' ? (
            <ImageIcon
              className='size-5'
              aria-hidden='true'
            />
          ) : (
            <UploadCloud
              className='size-5'
              aria-hidden='true'
            />
          )}
        </div>

        <div className='grid gap-1'>
          <p className='text-sm font-medium'>
            {isUploading ? `Uploading ${progress}%` : emptyText}
          </p>
          <p className='text-muted-foreground text-xs'>
            {multiple
              ? `You can upload up to ${maxFiles} files.`
              : 'You can upload one file.'}
          </p>
        </div>

        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!canAddFiles}
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
        >
          {buttonText}
        </Button>

        {isUploading ? (
          <div className='bg-muted h-1.5 w-full max-w-xs overflow-hidden rounded-full'>
            <div
              className='bg-primary h-full transition-[width]'
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </div>

      {uploadError ? (
        <p
          role='alert'
          className='text-destructive text-sm'
        >
          {uploadError}
        </p>
      ) : null}

      {value.length > 0 ? (
        <ul
          className='grid gap-2'
          aria-label='Uploaded files'
        >
          {value.map((file) => (
            <li
              key={file.key}
              className='bg-card flex items-center gap-3 rounded-md border p-3'
            >
              {mode === 'image' || isImageFile(file) ? (
                // A standard img element works with any UploadThing host.
                // Use next/image instead if the host is configured in next.config.
                <img
                  src={file.url}
                  alt={`Preview of ${file.name}`}
                  className='size-12 rounded-md border object-cover'
                />
              ) : (
                <div className='bg-muted flex size-12 items-center justify-center rounded-md border'>
                  {isAudioFile(file) ? (
                    <AudioLines
                      className='size-5'
                      aria-hidden='true'
                    />
                  ) : isVideoFile(file) ? (
                    <Video
                      className='size-5'
                      aria-hidden='true'
                    />
                  ) : (
                    <FileIcon
                      className='size-5'
                      aria-hidden='true'
                    />
                  )}
                </div>
              )}

              <div className='min-w-0 flex-1'>
                <a
                  href={file.url}
                  target='_blank'
                  rel='noreferrer'
                  className='block truncate text-sm font-medium hover:underline'
                >
                  {file.name}
                </a>
                <p className='text-muted-foreground text-xs'>
                  {formatFileSize(file.size)}
                </p>
              </div>

              <Button
                type='button'
                variant='ghost'
                size='icon'
                disabled={disabled || isUploading}
                aria-label={`Remove ${file.name}`}
                onClick={() => removeFile(file.key)}
              >
                <X
                  className='size-4'
                  aria-hidden='true'
                />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FileUploadField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  mode = 'file',
  description,
  disabled = false,
  required = false,
  showRequiredAsterisk = true,
  multiple = false,
  maxFiles = multiple ? 5 : 1,
  accept,
  className,
  emptyText,
  buttonText,
}: FileUploadFieldProps<TFieldValues, TName>) {
  const fieldId = String(name);
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const value = Array.isArray(field.value)
          ? (field.value as UploadedFileValue[])
          : [];
        const describedBy = [
          description ? descriptionId : null,
          fieldState.error ? errorId : null,
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <Field
            data-invalid={fieldState.invalid || undefined}
            className={cn('grid gap-2', className)}
          >
            <FieldLabel htmlFor={`${fieldId}-upload`}>
              {label}
              <RequiredAsterisk
                required={required}
                show={showRequiredAsterisk}
              />
            </FieldLabel>

            <FieldContent>
              <UploadFieldBody
                id={`${fieldId}-upload`}
                mode={mode}
                value={value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={disabled}
                invalid={fieldState.invalid}
                describedBy={describedBy || undefined}
                multiple={multiple}
                maxFiles={Math.max(maxFiles, 1)}
                accept={
                  accept ??
                  (mode === 'image'
                    ? 'image/*'
                    : mode === 'audio'
                      ? 'audio/*'
                      : mode === 'media'
                        ? 'image/*,audio/*,video/*'
                        : '*/*')
                }
                emptyText={
                  emptyText ??
                  (mode === 'image'
                    ? 'Drag images here or choose images'
                    : mode === 'audio'
                      ? 'Drag audio here or choose audio'
                      : mode === 'media'
                        ? 'Drag images, audio, or video here'
                        : 'Drag files here or choose files')
                }
                buttonText={buttonText ?? 'Choose files'}
              />

              {description ? (
                <FieldDescription id={descriptionId}>
                  {description}
                </FieldDescription>
              ) : null}

              <FieldError
                id={errorId}
                errors={[fieldState.error]}
              />
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}
