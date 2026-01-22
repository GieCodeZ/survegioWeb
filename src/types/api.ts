// API-related types for Survegio

// Generic API response wrapper (Directus format)
export interface ApiResponse<T> {
  data: T
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[]
  meta?: PaginationMeta
}

// Pagination metadata
export interface PaginationMeta {
  total_count?: number
  filter_count?: number
}

// Query parameters for list endpoints
export interface QueryParams {
  fields?: string[]
  filter?: Record<string, any>
  sort?: string | string[]
  limit?: number
  offset?: number
  page?: number
  search?: string
  deep?: Record<string, any>
}

// Common API error response
export interface ApiError {
  message: string
  extensions?: {
    code: string
    [key: string]: any
  }
}

// Auth types
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires: number
}

export interface RefreshRequest {
  refresh_token: string
}

export interface RefreshResponse {
  access_token: string
  refresh_token: string
  expires: number
}

// CRUD operation result types
export interface CreateResult<T> {
  data: T
  success: boolean
  error?: string
}

export interface UpdateResult<T> {
  data: T
  success: boolean
  error?: string
}

export interface DeleteResult {
  success: boolean
  error?: string
}

// Bulk operation types
export interface BulkCreateRequest<T> {
  items: Partial<T>[]
}

export interface BulkUpdateRequest<T> {
  keys: (string | number)[]
  data: Partial<T>
}

export interface BulkDeleteRequest {
  keys: (string | number)[]
}
