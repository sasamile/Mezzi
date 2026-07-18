"use client";

import * as React from "react";
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form";

type FormProps<TFieldValues extends FieldValues = FieldValues> = React.ComponentProps<
  typeof FormProvider<TFieldValues>
>;

export function Form<TFieldValues extends FieldValues>({
  children,
  ...props
}: FormProps<TFieldValues>) {
  return <FormProvider {...props}>{children}</FormProvider>;
}

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue | undefined>(
  undefined,
);

export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, control } = useFormContext();

  if (!fieldContext) {
    throw new Error("useFormField must be used within a FormField");
  }

  const fieldState = getFieldState(fieldContext.name, control._formState);

  return {
    id: itemContext?.id,
    name: fieldContext.name,
    formItemId: itemContext?.id,
    ...fieldState,
  };
}

export type FormFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = ControllerProps<TFieldValues, TName>;

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, ...props }: FormFieldProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name }}>
      <Controller name={name} {...props} />
    </FormFieldContext.Provider>
  );
}

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue | undefined>(
  undefined,
);

export interface FormItemProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(
  ({ className, ...props }, ref) => {
    const id = React.useId();

    return (
      <FormItemContext.Provider value={{ id }}>
        <div
          ref={ref}
          className={`space-y-1.5 ${className ?? ""}`}
          {...props}
        />
      </FormItemContext.Provider>
    );
  },
);

FormItem.displayName = "FormItem";

export interface FormLabelProps
  extends React.HTMLAttributes<HTMLLabelElement> {}

export const FormLabel = React.forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ className, ...props }, ref) => {
    const { error, formItemId } = useFormField();

    return (
      <label
        ref={ref}
        htmlFor={formItemId}
        className={`text-sm font-medium leading-none ${
          error ? "text-destructive" : "text-foreground"
        } ${className ?? ""}`}
        {...props}
      />
    );
  },
);

FormLabel.displayName = "FormLabel";

export interface FormControlProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const FormControl = React.forwardRef<HTMLDivElement, FormControlProps>(
  ({ className, ...props }, ref) => {
    const { formItemId } = useFormField();

    return (
      <div
        ref={ref}
        id={formItemId}
        className={`${className ?? ""}`}
        {...props}
      />
    );
  },
);

FormControl.displayName = "FormControl";

export interface FormMessageProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  FormMessageProps
>(({ className, children, ...props }, ref) => {
  const { error } = useFormField();
  const body = children ?? error?.message;

  if (!body) return null;

  return (
    <p
      ref={ref}
      className={`text-xs text-destructive ${className ?? ""}`}
      {...props}
    >
      {body}
    </p>
  );
});

FormMessage.displayName = "FormMessage";

