import { toast as sonner } from "sonner";

type ToastOpts = {
  title: string;
  description?: string;
};

/**
 * API compatible con el antiguo sileo — toast limpio vía Sonner.
 */
export const sileo = {
  success({ title, description }: ToastOpts) {
    sonner.success(title, { description });
  },
  error({ title, description }: ToastOpts) {
    sonner.error(title, { description });
  },
  info({ title, description }: ToastOpts) {
    sonner.message(title, { description });
  },
};

export { sonner as toast };
