'use client';

import * as React from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type TagInputProps = {
  value?: string[];
  onChange: (tags: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxTags?: number;
  maxTagLength?: number;
  replaceSpacesWithHyphens?: boolean;
  className?: string;
};

export function TagInput({
  value = [],
  onChange,
  onBlur,
  placeholder = 'Type a tag and press Enter',
  disabled = false,
  maxTags = 10,
  maxTagLength = 30,
  replaceSpacesWithHyphens = true,
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = React.useState('');

  const normalizeTag = React.useCallback(
    (tag: string) => {
      let normalizedTag = tag.trim().toLowerCase();

      if (replaceSpacesWithHyphens) {
        normalizedTag = normalizedTag.replace(/\s+/g, '-');
      } else {
        normalizedTag = normalizedTag.replace(/\s+/g, ' ');
      }

      // Remove leading and trailing hyphens.
      normalizedTag = normalizedTag.replace(/^-+|-+$/g, '');

      // Collapse repeated hyphens.
      normalizedTag = normalizedTag.replace(/-{2,}/g, '-');

      return normalizedTag.slice(0, maxTagLength);
    },
    [maxTagLength, replaceSpacesWithHyphens],
  );

  const addTags = React.useCallback(
    (rawValue: string) => {
      if (disabled || value.length >= maxTags) {
        return;
      }

      /*
       * Splitting on commas lets users paste:
       * "nextjs, typescript, prisma"
       *
       * A single tag also works normally.
       */
      const candidates = rawValue
        .split(',')
        .map(normalizeTag)
        .filter(Boolean);

      if (candidates.length === 0) {
        setInputValue('');
        return;
      }

      const currentTags = new Set(value);
      const availableSlots = maxTags - value.length;

      const newTags = candidates
        .filter((tag) => !currentTags.has(tag))
        .filter((tag, index, tags) => tags.indexOf(tag) === index)
        .slice(0, availableSlots);

      if (newTags.length > 0) {
        onChange([...value, ...newTags]);
      }

      setInputValue('');
    },
    [disabled, maxTags, normalizeTag, onChange, value],
  );

  const removeTag = React.useCallback(
    (tagToRemove: string) => {
      if (disabled) {
        return;
      }

      onChange(value.filter((tag) => tag !== tagToRemove));
    },
    [disabled, onChange, value],
  );

  const removeLastTag = React.useCallback(() => {
    if (disabled || inputValue.length > 0 || value.length === 0) {
      return;
    }

    onChange(value.slice(0, -1));
  }, [disabled, inputValue.length, onChange, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();

      if (inputValue.trim()) {
        addTags(inputValue);
      }

      return;
    }

    if (event.key === 'Backspace') {
      removeLastTag();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData('text');

    if (!pastedText.includes(',')) {
      return;
    }

    event.preventDefault();
    addTags(pastedText);
  };

  const handleBlur = () => {
    /*
     * This automatically adds an unfinished tag when the
     * user clicks away from the input.
     */
    if (inputValue.trim()) {
      addTags(inputValue);
    }

    onBlur?.();
  };

  const hasReachedLimit = value.length >= maxTags;

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 shadow-xs transition-[color,box-shadow]',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {value.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="gap-1 rounded-md px-2 py-1"
          >
            <span>{tag}</span>

            <button
              type="button"
              aria-label={`Remove ${tag} tag`}
              disabled={disabled}
              onClick={() => removeTag(tag)}
              className={cn(
                'rounded-sm text-muted-foreground transition-colors',
                'hover:text-foreground focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring',
                disabled && 'pointer-events-none',
              )}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}

        <Input
          value={inputValue}
          disabled={disabled || hasReachedLimit}
          placeholder={
            hasReachedLimit ? `Maximum of ${maxTags} tags` : placeholder
          }
          aria-label="Add a tag"
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          className={cn(
            'h-6 min-w-32 flex-1 border-0 bg-transparent p-0 shadow-none',
            'focus-visible:ring-0 dark:bg-transparent',
          )}
        />
      </div>

      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>Press Enter or comma to add a tag.</p>

        <p>
          {value.length}/{maxTags}
        </p>
      </div>
    </div>
  );
}

type TagInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  maxTags?: number;
  maxTagLength?: number;
  replaceSpacesWithHyphens?: boolean;
  className?: string;
};

export function TagInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled = false,
  required = false,
  maxTags = 10,
  maxTagLength = 30,
  replaceSpacesWithHyphens = true,
  className,
}: TagInputFieldProps<TFieldValues, TName>) {
  const fieldId = React.useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const descriptionId = description
          ? `${fieldId}-description`
          : undefined;

        const errorId = fieldState.error ? `${fieldId}-error` : undefined;

        const describedBy =
          [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

        return (
          <div className={cn('space-y-2', className)}>
            {label ? (
              <Label htmlFor={fieldId}>
                {label}

                {required ? (
                  <span className="ml-1 text-destructive" aria-hidden="true">
                    *
                  </span>
                ) : null}
              </Label>
            ) : null}

            <div
              id={fieldId}
              aria-invalid={fieldState.invalid}
              aria-describedby={describedBy}
            >
              <TagInput
                value={Array.isArray(field.value) ? field.value : []}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={placeholder}
                disabled={disabled}
                maxTags={maxTags}
                maxTagLength={maxTagLength}
                replaceSpacesWithHyphens={replaceSpacesWithHyphens}
              />
            </div>

            {description ? (
              <p
                id={descriptionId}
                className="text-sm text-muted-foreground"
              >
                {description}
              </p>
            ) : null}

            {fieldState.error?.message ? (
              <p id={errorId} className="text-sm text-destructive">
                {fieldState.error.message}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}