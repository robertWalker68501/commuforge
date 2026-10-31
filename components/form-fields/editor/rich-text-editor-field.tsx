"use client";

import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";

import {
  RichTextEditor,
  type RichTextEditorProps,
} from "./rich-text-editor";

type RichTextEditorFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  description?: string;
  required?: boolean;
  className?: string;
} & Omit<
  RichTextEditorProps,
  | "id"
  | "value"
  | "onChange"
  | "onBlur"
  | "invalid"
  | "ariaDescribedBy"
  | "className"
>;

export function RichTextEditorField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label = "Content",
  description,
  required = false,
  className,
  ...editorProps
}: RichTextEditorFieldProps<
  TFieldValues,
  TName
>) {
  const {
    field,
    fieldState: { error, invalid },
  } = useController({
    control,
    name,
  });

  const fieldName = String(name);
  const editorId = `${fieldName}-editor`;
  const descriptionId =
    `${fieldName}-description`;
  const errorId = `${fieldName}-error`;

  const ariaDescribedBy = [
    description ? descriptionId : null,
    error?.message ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cn(
        "grid gap-2",
        className,
      )}
    >
      <label
        htmlFor={editorId}
        className="text-sm font-medium leading-none"
      >
        {label}

        {required ? (
          <>
            <span
              className="ml-1 text-destructive"
              aria-hidden="true"
            >
              *
            </span>
            <span className="sr-only">
              Required
            </span>
          </>
        ) : null}
      </label>

      {description ? (
        <p
          id={descriptionId}
          className="text-sm text-muted-foreground"
        >
          {description}
        </p>
      ) : null}

      <RichTextEditor
        {...editorProps}
        id={editorId}
        value={
          typeof field.value === "string"
            ? field.value
            : ""
        }
        onChange={field.onChange}
        onBlur={field.onBlur}
        invalid={invalid}
        ariaDescribedBy={
          ariaDescribedBy || undefined
        }
      />

      {error?.message ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-destructive"
        >
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
