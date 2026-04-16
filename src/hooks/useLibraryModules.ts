// operator/src/hooks/useLibraryModules.ts
// Updated for Two-Tier Storage architecture
// Also merges operator-authored custom commands from /api/custom-commands.

import { useState, useEffect, useCallback } from 'react';
import {
  libraryModuleService,
  LibraryModuleMetadata,
  LibraryModulePayload,
  LibraryModule,
  LibraryModuleFilters,
} from '../services/libraryModuleService';
import { API_CONFIG } from '@/config/api';

/**
 * Hook for fetching module metadata (lightweight, for palette/search)
 *
 * Use this for:
 * - Node palette display
 * - Search results
 * - Module listings
 *
 * Fetches both the main library and operator-authored custom commands in
 * parallel and merges them. Custom commands are tagged `isCustom: true`
 * so the palette can render a CUSTOM badge on their cards.
 */
export function useLibraryModules(filters?: LibraryModuleFilters) {
  const [modules, setModules] = useState<LibraryModuleMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function fetchModules() {
      try {
        setLoading(true);
        setError(null);

        // Fetch library + custom commands in parallel
        const [libraryData, customData] = await Promise.all([
          libraryModuleService.getAllModules(filters),
          // Custom commands bypass the service cache so they stay fresh on refresh()
          fetch(`${API_CONFIG.BASE_URL}/api/custom-commands`)
            .then(r => (r.ok ? r.json() : { modules: [] }))
            .then(d => (d.modules ?? []) as LibraryModuleMetadata[])
            .catch(() => []),
        ]);

        // Customs first so they appear at the top of each tactic group
        const merged = [...customData, ...libraryData];

        if (mounted) {
          setModules(merged);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load modules');
          setLoading(false);
        }
      }
    }

    fetchModules();

    return () => {
      mounted = false;
    };
  }, [JSON.stringify(filters), refreshTrigger]);

  const refresh = useCallback(() => {
    libraryModuleService.clearCache();
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return { modules, loading, error, refresh };
}

/**
 * Hook for fetching a single module's metadata
 */
export function useLibraryModule(moduleKey: string) {
  const [module, setModule] = useState<LibraryModuleMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchModule() {
      if (!moduleKey) {
        setModule(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await libraryModuleService.getModule(moduleKey);

        if (mounted) {
          setModule(data);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load module');
          setLoading(false);
        }
      }
    }

    fetchModule();

    return () => {
      mounted = false;
    };
  }, [moduleKey]);

  return { module, loading, error };
}

/**
 * Hook for fetching a module's full payload
 *
 * Use this when:
 * - Configuring a node (need inputs/outputs/parameters)
 * - Viewing module details
 * - Generating execution commands
 */
export function useModulePayload(moduleKey: string, payloadUrl?: string) {
  const [payload, setPayload] = useState<LibraryModulePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPayload = useCallback(async () => {
    if (!moduleKey) {
      setPayload(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await libraryModuleService.getModulePayload(moduleKey, payloadUrl);
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payload');
    } finally {
      setLoading(false);
    }
  }, [moduleKey, payloadUrl]);

  // Auto-fetch on mount if moduleKey is provided
  useEffect(() => {
    if (moduleKey) {
      fetchPayload();
    }
  }, [moduleKey, fetchPayload]);

  const openInNewTab = useCallback(() => {
    libraryModuleService.openPayloadInNewTab(moduleKey, payloadUrl);
  }, [moduleKey, payloadUrl]);

  return { payload, loading, error, refetch: fetchPayload, openInNewTab };
}

/**
 * Hook for fetching a module with its payload merged
 *
 * Convenience hook that combines metadata + payload into one object.
 * Use when you need the complete module definition.
 */
export function useModuleWithPayload(moduleKey: string) {
  const [module, setModule] = useState<LibraryModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchModuleWithPayload() {
      if (!moduleKey) {
        setModule(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await libraryModuleService.getModuleWithPayload(moduleKey);

        if (mounted) {
          setModule(data);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load module');
          setLoading(false);
        }
      }
    }

    fetchModuleWithPayload();

    return () => {
      mounted = false;
    };
  }, [moduleKey]);

  const openPayloadInNewTab = useCallback(() => {
    if (module?.payload_url) {
      libraryModuleService.openPayloadInNewTab(moduleKey, module.payload_url);
    }
  }, [moduleKey, module?.payload_url]);

  return { module, loading, error, openPayloadInNewTab };
}

/**
 * Hook for lazy-loading payload on demand
 *
 * Returns metadata immediately, loads payload only when requested.
 * Good for lists where you might expand one item.
 */
export function useLazyModulePayload(moduleKey: string) {
  const { module: metadata, loading: metadataLoading, error: metadataError } = useLibraryModule(moduleKey);
  const [payload, setPayload] = useState<LibraryModulePayload | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [payloadLoaded, setPayloadLoaded] = useState(false);

  const loadPayload = useCallback(async () => {
    if (!moduleKey || payloadLoaded) return;

    try {
      setPayloadLoading(true);
      setPayloadError(null);
      const data = await libraryModuleService.getModulePayload(moduleKey, metadata?.payload_url);
      setPayload(data);
      setPayloadLoaded(true);
    } catch (err) {
      setPayloadError(err instanceof Error ? err.message : 'Failed to load payload');
    } finally {
      setPayloadLoading(false);
    }
  }, [moduleKey, metadata?.payload_url, payloadLoaded]);

  const openInNewTab = useCallback(() => {
    libraryModuleService.openPayloadInNewTab(moduleKey, metadata?.payload_url);
  }, [moduleKey, metadata?.payload_url]);

  // Combined module (metadata + payload if loaded)
  const module: LibraryModule | null = metadata ? {
    ...metadata,
    ...(payload || {})
  } : null;

  return {
    module,
    metadata,
    payload,
    loading: metadataLoading,
    payloadLoading,
    error: metadataError,
    payloadError,
    payloadLoaded,
    loadPayload,
    openInNewTab,
  };
}