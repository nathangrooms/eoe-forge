import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { useAuth } from '@/components/AuthProvider';
import { toast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, Check } from 'lucide-react';

export default function Register() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [freePlan, setFreePlan] = useState(true);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure your passwords match.',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters long.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(formData.email, formData.password, formData.username);
      
      if (error) {
        // Handle specific error cases
        if (error.message?.includes('already registered')) {
          toast({
            title: 'Account exists',
            description: 'This email is already registered. Please sign in instead.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Sign up failed',
            description: error.message,
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Welcome to DeckMatrix!',
          description: 'Your account has been created successfully.',
        });
        // Auth state change will auto-redirect to dashboard
        navigate('/dashboard');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      description="Join thousands of players building better decks with AI."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-medium">
            Username
          </Label>
          <Input
            id="username"
            name="username"
            type="text"
            value={formData.username}
            onChange={handleChange}
            required
            className="bg-background/50 border-spacecraft/20 focus:border-spacecraft focus:ring-spacecraft/20"
            placeholder="Choose a username"
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="bg-background/50 border-spacecraft/20 focus:border-spacecraft focus:ring-spacecraft/20"
            placeholder="your@email.com"
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              required
              className="bg-background/50 border-spacecraft/20 focus:border-spacecraft focus:ring-spacecraft/20 pr-10"
              placeholder="Create a password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-spacecraft transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">
            Confirm Password
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className="bg-background/50 border-spacecraft/20 focus:border-spacecraft focus:ring-spacecraft/20 pr-10"
              placeholder="Confirm your password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-spacecraft transition-colors"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Free Plan Option */}
        <div className="flex items-start space-x-3 p-4 rounded-lg bg-spacecraft/5 border border-spacecraft/20">
          <Checkbox 
            id="freePlan" 
            checked={freePlan}
            onCheckedChange={(checked) => setFreePlan(checked as boolean)}
          />
          <div className="flex-1">
            <Label htmlFor="freePlan" className="text-sm font-medium flex items-center gap-2">
              <Check className="h-4 w-4 text-spacecraft" />
              Start with Free Plan (upgrade anytime)
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Basic collection manager, 1 deck, wishlist tracking
            </p>
          </div>
        </div>

        {/* Submit Button */}
        <Button 
          type="submit" 
          className="w-full bg-spacecraft hover:bg-station transition-colors"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create Account'
          )}
        </Button>

        {/* Terms */}
        <p className="text-xs text-muted-foreground text-center">
          By creating an account, you agree to our{' '}
          <Link to="/terms" className="text-spacecraft hover:text-station transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-spacecraft hover:text-station transition-colors">
            Privacy Policy
          </Link>
          .
        </p>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        {/* Sign In Link */}
        <div className="text-center">
          <p className="text-muted-foreground">
            Already have an account?{' '}
            <Link 
              to="/login" 
              className="text-spacecraft hover:text-station transition-colors font-medium"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
}