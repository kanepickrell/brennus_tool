// operator/src/services/libraryModuleService.ts
// Updated for Two-Tier Storage: Lightweight metadata + Heavy payload architecture
//
// The service now:
// 1. Fetches lightweight metadata from plugin endpoints (for palette/search)
// 2. Fetches full payload on-demand when configuring a node

import { API_CONFIG } from '@/config/api';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Lightweight metadata stored in ArangoDB
 * Used for graph visualization, search, and palette display
 */
export interface LibraryModuleMetadata {
  _key: string;
  _id?: string;
  id?: string;
  name: string;
  icon?: string;
  tactic?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  estimatedDuration?: number | string;
  executionType?: string;
  tags?: string[];
  owner?: string;
  status?: string;
  _artifact_type?: string;
  _ingested_at?: string;
  payload_url?: string;  // URL to fetch full payload
}

/**
 * Full payload stored in file system
 * Contains all operational details needed by Operator
 */
export interface LibraryModulePayload extends LibraryModuleMetadata {
  // Execution details
  cobaltStrikeCommand?: string;
  robotKeyword?: string;
  robotTemplate?: string;
  robotLibrary?: string;
  shellCommand?: string;
  
  // I/O definitions
  inputs?: Array<{
    id: string;
    label: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;
  outputs?: Array<{
    id: string;
    label: string;
    type: string;
    description?: string;
  }>;
  parameters?: Array<{
    id: string;
    label: string;
    type: string;
    required?: boolean;
    default?: any;
    placeholder?: string;
    options?: string[] | Array<{ value: string; label: string }>;
    description?: string;
  }>;
  
  // Requirements
  requirements?: {
    c2Server?: boolean;
    listeners?: string[];
    payloads?: string[];
    sshConnections?: string[];
    externalTools?: string[];
    libraries?: string[];
  };
  
  // MITRE mapping
  mitre?: {
    tacticId?: string;
    techniqueId?: string;
  };
  
  // Output object definitions
  outputObjects?: Array<{
    type: string;
    collection: string;
    create: boolean;
    keyStrategy: string;
    keyTemplate?: string;
    schema?: Record<string, any>;
  }>;
  
  // Full metadata block
  metadata?: {
    version?: string;
    lastUpdated?: string;
    updatedBy?: string;
    validationStatus?: string;
    changeLog?: string;
    owner?: string;
    status?: string;
    tags?: string[];
  };
  
  // Payload metadata
  _payload_version?: string;
  _saved_at?: string;
  _artifact_key?: string;
}

/**
 * Combined type for use in Operator - starts as metadata, enriched with payload
 */
export type LibraryModule = LibraryModuleMetadata & Partial<LibraryModulePayload>;

export interface LibraryModuleFilters {
  category?: string;
  tactic?: string;
  execution_type?: string;
  risk_level?: string;
  search?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface CategoryCount {
  value: string;
  count: number;
}

export interface TacticCount {
  value: string;
  count: number;
}

export interface ModuleStats {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  byTactic: Array<{ tactic: string; count: number }>;
  byRiskLevel: Array<{ riskLevel: string; count: number }>;
  byExecutionType: Array<{ executionType: string; count: number }>;
}

// ============================================================================
// SERVICE
// ============================================================================

class LibraryModuleService {
  private metadataCache: Map<string, { data: any; timestamp: number }> = new Map();
  private payloadCache: Map<string, { data: LibraryModulePayload; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  private getCached<T>(cache: Map<string, { data: any; timestamp: number }>, key: string): T | null {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as T;
    }
    return null;
  }

  private setCache(cache: Map<string, { data: any; timestamp: number }>, key: string, data: any): void {
    cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Get all library modules (metadata only) with optional filters
   * 
   * This is the primary method for populating the node palette.
   * Returns lightweight metadata - no inputs/outputs/parameters.
   */
  async getAllModules(filters?: LibraryModuleFilters): Promise<LibraryModuleMetadata[]> {
    const cacheKey = `modules:${JSON.stringify(filters || {})}`;
    const cached = this.getCached<LibraryModuleMetadata[]>(this.metadataCache, cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.tactic) params.append('tactic', filters.tactic);
    if (filters?.execution_type) params.append('execution_type', filters.execution_type);
    if (filters?.risk_level) params.append('risk_level', filters.risk_level);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const queryString = params.toString();
    const endpoint = API_CONFIG.ENDPOINTS.OPERATOR_MODULES;
    const url = `${API_CONFIG.BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;

    console.log('🔍 Fetching module metadata from:', url);

    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 403) {
        console.warn('⚠️ Operator plugin is disabled');
        return [];
      }
      throw new Error(`Failed to fetch modules: ${response.statusText}`);
    }

    const data = await response.json();
    const modules = data.modules || data.data || [];
    
    console.log(`✅ Loaded ${modules.length} module metadata records`);

    this.setCache(this.metadataCache, cacheKey, modules);
    return modules;
  }

  /**
   * Get a single module's metadata by key
   */
  async getModule(moduleKey: string): Promise<LibraryModuleMetadata | null> {
    const cacheKey = `module:${moduleKey}`;
    const cached = this.getCached<LibraryModuleMetadata>(this.metadataCache, cacheKey);
    if (cached) return cached;

    const endpoint = API_CONFIG.ENDPOINTS.OPERATOR_MODULE_DETAIL(moduleKey);
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) return null;
      if (response.status === 403) {
        console.warn('⚠️ Operator plugin is disabled');
        return null;
      }
      throw new Error(`Failed to fetch module: ${response.statusText}`);
    }

    const data = await response.json();
    const module = data.module || data.data || data;

    this.setCache(this.metadataCache, cacheKey, module);
    return module;
  }

  /**
   * Fetch the full payload for a module
   * 
   * This is called when a user configures a node and needs:
   * - inputs/outputs/parameters
   * - execution commands
   * - requirements
   * - output object definitions
   * 
   * @param moduleKey The module's _key
   * @param payloadUrl Optional direct URL (from metadata.payload_url)
   */
  async getModulePayload(moduleKey: string, payloadUrl?: string): Promise<LibraryModulePayload | null> {
    const cacheKey = `payload:${moduleKey}`;
    const cached = this.getCached<LibraryModulePayload>(this.payloadCache, cacheKey);
    if (cached) return cached;

    // Determine URL
    let url: string;
    if (payloadUrl) {
      // Use provided payload URL
      url = payloadUrl.startsWith('http') 
        ? payloadUrl 
        : `${API_CONFIG.BASE_URL}${payloadUrl}`;
    } else {
      // Construct from module key
      url = `${API_CONFIG.BASE_URL}/api/ingest/payloads/${moduleKey}.json`;
    }

    console.log(`📦 Fetching payload for ${moduleKey} from:`, url);

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`⚠️ No payload found for ${moduleKey}`);
          return null;
        }
        throw new Error(`Failed to fetch payload: ${response.statusText}`);
      }

      const payload = await response.json();
      console.log(`✅ Loaded payload for ${moduleKey}:`, {
        hasInputs: !!payload.inputs?.length,
        hasOutputs: !!payload.outputs?.length,
        hasParameters: !!payload.parameters?.length,
      });

      this.setCache(this.payloadCache, cacheKey, payload);
      return payload;
      
    } catch (error) {
      console.error(`❌ Failed to fetch payload for ${moduleKey}:`, error);
      return null;
    }
  }

  /**
   * Get a module with its full payload merged
   * 
   * Convenience method that:
   * 1. Fetches metadata
   * 2. Fetches payload
   * 3. Merges them into a complete LibraryModule
   */
  async getModuleWithPayload(moduleKey: string): Promise<LibraryModule | null> {
    // Get metadata first
    const metadata = await this.getModule(moduleKey);
    if (!metadata) return null;

    // Get payload
    const payload = await this.getModulePayload(moduleKey, metadata.payload_url);
    
    if (payload) {
      // Merge payload into metadata (payload takes precedence)
      return {
        ...metadata,
        ...payload,
        // Ensure key fields from metadata are preserved
        _key: metadata._key,
        _id: metadata._id,
      };
    }

    // Return metadata only if no payload
    return metadata as LibraryModule;
  }

  /**
   * Get all categories with counts
   */
  async getCategories(): Promise<CategoryCount[]> {
    const cacheKey = 'categories';
    const cached = this.getCached<CategoryCount[]>(this.metadataCache, cacheKey);
    if (cached) return cached;

    const endpoint = API_CONFIG.ENDPOINTS.OPERATOR_CATEGORIES;
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 403) return [];
      throw new Error(`Failed to fetch categories: ${response.statusText}`);
    }

    const data = await response.json();
    const categories = data.data || data.categories || [];

    this.setCache(this.metadataCache, cacheKey, categories);
    return categories;
  }

  /**
   * Get all tactics with counts
   */
  async getTactics(): Promise<TacticCount[]> {
    const cacheKey = 'tactics';
    const cached = this.getCached<TacticCount[]>(this.metadataCache, cacheKey);
    if (cached) return cached;

    const endpoint = API_CONFIG.ENDPOINTS.OPERATOR_TACTICS;
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 403) return [];
      throw new Error(`Failed to fetch tactics: ${response.statusText}`);
    }

    const data = await response.json();
    const tactics = data.data || data.tactics || [];

    this.setCache(this.metadataCache, cacheKey, tactics);
    return tactics;
  }

  /**
   * Get module statistics
   */
  async getStats(): Promise<ModuleStats | null> {
    const cacheKey = 'stats';
    const cached = this.getCached<ModuleStats>(this.metadataCache, cacheKey);
    if (cached) return cached;

    const endpoint = API_CONFIG.ENDPOINTS.OPERATOR_STATS;
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 403) return null;
      throw new Error(`Failed to fetch stats: ${response.statusText}`);
    }

    const data = await response.json();
    const stats = data.stats || data;

    this.setCache(this.metadataCache, cacheKey, stats);
    return stats;
  }

  /**
   * Validate module requirements against current environment
   */
  async validateRequirements(
    moduleKey: string,
    environment: {
      c2Server?: boolean;
      listeners?: string[];
      payloads?: string[];
      sshConnections?: string[];
    }
  ): Promise<{ valid: boolean; missing: string[] }> {
    const endpoint = API_CONFIG.ENDPOINTS.OPERATOR_VALIDATE;
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleKey, environment }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        return { valid: false, missing: ['Plugin disabled'] };
      }
      throw new Error(`Validation failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Open payload URL in a new browser tab
   */
  openPayloadInNewTab(moduleKey: string, payloadUrl?: string): void {
    let url: string;
    if (payloadUrl) {
      url = payloadUrl.startsWith('http') 
        ? payloadUrl 
        : `${API_CONFIG.BASE_URL}${payloadUrl}`;
    } else {
      url = `${API_CONFIG.BASE_URL}/api/ingest/payloads/${moduleKey}.json`;
    }
    
    window.open(url, '_blank');
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.metadataCache.clear();
    this.payloadCache.clear();
    console.log('🗑️ Library module caches cleared');
  }

  /**
   * Clear only payload cache (metadata stays)
   */
  clearPayloadCache(): void {
    this.payloadCache.clear();
    console.log('🗑️ Payload cache cleared');
  }
}

// Export singleton instance
export const libraryModuleService = new LibraryModuleService();

// Export types for convenience
export type { LibraryModuleMetadata, LibraryModulePayload, LibraryModule };