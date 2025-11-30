import React, { Component, ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  featureName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary specifically for AI features
 * Provides graceful degradation when AI components fail
 */
export class AIErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AI Feature Error:', this.props.featureName || 'Unknown', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 flex items-center justify-between gap-4">
            <span>
              {this.props.featureName || 'AI feature'} temporarily unavailable. 
              {this.state.error?.message && ` (${this.state.error.message})`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="shrink-0"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}
