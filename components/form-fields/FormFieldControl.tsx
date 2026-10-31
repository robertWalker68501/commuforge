'use client';

import * as React from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type FormFieldOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type BaseFormFieldControlProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  showRequiredAsterisk?: boolean;
};

type InputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFormFieldControlProps<TFieldValues, TName> & {
  type:
    | 'text'
    | 'email'
    | 'password'
    | 'search'
    | 'tel'
    | 'url'
    | 'number'
    | 'date'
    | 'time';
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
};

type TextareaFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFormFieldControlProps<TFieldValues, TName> & {
  type: 'textarea';
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  textareaClassName?: string;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
};

type SelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFormFieldControlProps<TFieldValues, TName> & {
  type: 'select';
  placeholder?: string;
  options: FormFieldOption[];
};

type CheckboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = BaseFormFieldControlProps<TFieldValues, TName> & {
  type: 'checkbox';
  checkboxLabel?: React.ReactNode;
};

export type FormFieldControlProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> =
  | InputFieldProps<TFieldValues, TName>
  | TextareaFieldProps<TFieldValues, TName>
  | SelectFieldProps<TFieldValues, TName>
  | CheckboxFieldProps<TFieldValues, TName>;

function RequiredAsterisk({
  required,
  show,
}: {
  required?: boolean;
  show?: boolean;
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

export function FormFieldControl<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: FormFieldControlProps<TFieldValues, TName>) {
  const {
    control,
    name,
    label,
    description,
    disabled = false,
    className,
    required = false,
    showRequiredAsterisk = true,
  } = props;

  const fieldId = String(name);
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const describedBy = [
          description ? descriptionId : null,
          fieldState.error ? errorId : null,
        ]
          .filter(Boolean)
          .join(' ');

        if (props.type === 'checkbox') {
          return (
            <Field
              data-invalid={fieldState.invalid || undefined}
              className={cn('grid gap-2', className)}
            >
              <div className='flex items-start gap-3'>
                <Checkbox
                  id={fieldId}
                  name={field.name}
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                  onBlur={field.onBlur}
                  disabled={disabled}
                  aria-invalid={fieldState.invalid || undefined}
                  aria-describedby={describedBy || undefined}
                  ref={field.ref}
                />

                <FieldContent className='gap-1'>
                  <FieldLabel
                    htmlFor={fieldId}
                    className='cursor-pointer leading-snug'
                  >
                    {props.checkboxLabel ?? label}
                    <RequiredAsterisk
                      required={required}
                      show={showRequiredAsterisk}
                    />
                  </FieldLabel>

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
              </div>
            </Field>
          );
        }

        return (
          <Field
            data-invalid={fieldState.invalid || undefined}
            className={cn('grid gap-2', className)}
          >
            <FieldLabel htmlFor={fieldId}>
              {label}
              <RequiredAsterisk
                required={required}
                show={showRequiredAsterisk}
              />
            </FieldLabel>

            <FieldContent>
              {props.type === 'select' ? (
                <Select
                  value={typeof field.value === 'string' ? field.value : ''}
                  onValueChange={field.onChange}
                  disabled={disabled}
                  name={field.name}
                >
                  <SelectTrigger
                    id={fieldId}
                    aria-invalid={fieldState.invalid || undefined}
                    aria-describedby={describedBy || undefined}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    <SelectValue
                      placeholder={props.placeholder ?? 'Select an option'}
                    >
                      {
                        props.options.find(
                          (option) => option.value === field.value
                        )?.label
                      }
                    </SelectValue>
                  </SelectTrigger>

                  <SelectContent>
                    {props.options.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : props.type === 'textarea' ? (
                <Textarea
                  id={fieldId}
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  rows={props.rows ?? 5}
                  maxLength={props.maxLength}
                  required={required}
                  className={cn(
                    'field-sizing-fixed',
                    props.resize === 'none' && 'resize-none',
                    props.resize === 'horizontal' && 'resize-x',
                    props.resize === 'both' && 'resize',
                    props.resize !== 'none' &&
                      props.resize !== 'horizontal' &&
                      props.resize !== 'both' &&
                      'resize-y',
                    props.textareaClassName
                  )}
                  placeholder={props.placeholder}
                  disabled={disabled}
                  aria-invalid={fieldState.invalid || undefined}
                  aria-describedby={describedBy || undefined}
                />
              ) : (
                <Input
                  id={fieldId}
                  type={props.type}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  placeholder={props.placeholder}
                  disabled={disabled}
                  required={required}
                  aria-invalid={fieldState.invalid || undefined}
                  aria-describedby={describedBy || undefined}
                  inputMode={props.inputMode}
                  autoComplete={props.autoComplete}
                  min={props.min}
                  max={props.max}
                  step={props.step}
                />
              )}

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
