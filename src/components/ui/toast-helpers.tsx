import { toast } from "@/hooks/use-toast";

export const showSuccess = (title: string, description?: string) => {
  toast({
    title,
    description,
    variant: "default",
  });
};

export const showError = (title: string, description?: string) => {
  toast({
    title,
    description,
    variant: "destructive",
  });
};

export const showLoading = (title: string, description?: string) => {
  return toast({
    title,
    description,
    duration: 0, // Don't auto-dismiss
  });
};

export const dismissToast = (toastId: string) => {
  // Implementation depends on the toast library
  // This is a placeholder for dismissing specific toasts
};