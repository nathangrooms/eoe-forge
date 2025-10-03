import { toast } from "@/hooks/use-toast";

export const showSuccess = (title: string, description?: string) => {
  toast({
    title,
    description,
    variant: "default",
    duration: 3000, // Auto-dismiss after 3 seconds
  });
};

export const showError = (title: string, description?: string) => {
  toast({
    title,
    description,
    variant: "destructive",
    duration: 5000, // Errors stay a bit longer
  });
};

export const showLoading = (title: string, description?: string) => {
  return toast({
    title,
    description,
    duration: Infinity, // Don't auto-dismiss loading toasts
  });
};

export const dismissToast = (toastId: string) => {
  // Implementation depends on the toast library
  // This is a placeholder for dismissing specific toasts
};