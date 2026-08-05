'use client';

/**
 * Error boundary around the WebGL hero.
 *
 * React only catches render-phase errors through a class component, and a driver that
 * refuses to allocate a context, a shader that fails to compile or a bad `three` upgrade
 * all surface as a throw somewhere under `<Canvas>`. Without this the whole marketing page
 * would unmount and the visitor would get a blank screen. With it, the poster takes over
 * and the rest of the page is untouched.
 *
 * Context *loss* (as opposed to a throw) is not a React error, so the scene reports that
 * separately through its `onContextLost` callback.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface WebGLBoundaryProps {
  children: ReactNode;
  /** Rendered in place of `children` once anything below has thrown. */
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface WebGLBoundaryState {
  hasError: boolean;
}

export class WebGLBoundary extends Component<WebGLBoundaryProps, WebGLBoundaryState> {
  constructor(props: WebGLBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): WebGLBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error);

    if (process.env.NODE_ENV !== 'production') {
      console.error('[servisloop] lifecycle scene failed, falling back to the poster', error, info);
    }
  }

  override render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
