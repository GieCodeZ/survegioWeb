// Base service with common CRUD operations
import { $api } from '@/utils/api'
import type { QueryParams } from '@/types'

export interface ServiceResponse<T> {
  data: T
  success: boolean
  error?: string
}

export interface ListResponse<T> {
  data: T[]
  success: boolean
  error?: string
}

export class BaseService<T> {
  protected collection: string

  constructor(collection: string) {
    this.collection = collection
  }

  /**
   * Fetch all items from the collection
   */
  async getAll(params?: QueryParams): Promise<ListResponse<T>> {
    try {
      const res = await $api(`/items/${this.collection}`, { params })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error(`Failed to fetch ${this.collection}:`, error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Fetch a single item by ID
   */
  async getById(id: number | string, params?: QueryParams): Promise<ServiceResponse<T | null>> {
    try {
      const res = await $api(`/items/${this.collection}/${id}`, { params })
      return { data: res.data, success: true }
    }
    catch (error) {
      console.error(`Failed to fetch ${this.collection}/${id}:`, error)
      return { data: null, success: false, error: String(error) }
    }
  }

  /**
   * Create a new item
   */
  async create(data: Partial<T>): Promise<ServiceResponse<T | null>> {
    try {
      const res = await $api(`/items/${this.collection}`, {
        method: 'POST',
        body: data,
      })
      return { data: res.data, success: true }
    }
    catch (error) {
      console.error(`Failed to create ${this.collection}:`, error)
      return { data: null, success: false, error: String(error) }
    }
  }

  /**
   * Update an existing item
   */
  async update(id: number | string, data: Partial<T>): Promise<ServiceResponse<T | null>> {
    try {
      const res = await $api(`/items/${this.collection}/${id}`, {
        method: 'PATCH',
        body: data,
      })
      return { data: res.data, success: true }
    }
    catch (error) {
      console.error(`Failed to update ${this.collection}/${id}:`, error)
      return { data: null, success: false, error: String(error) }
    }
  }

  /**
   * Delete an item
   */
  async delete(id: number | string): Promise<ServiceResponse<void>> {
    try {
      await $api(`/items/${this.collection}/${id}`, {
        method: 'DELETE',
      })
      return { data: undefined, success: true }
    }
    catch (error) {
      console.error(`Failed to delete ${this.collection}/${id}:`, error)
      return { data: undefined, success: false, error: String(error) }
    }
  }

  /**
   * Bulk create items
   */
  async createMany(items: Partial<T>[]): Promise<ListResponse<T>> {
    try {
      const res = await $api(`/items/${this.collection}`, {
        method: 'POST',
        body: items,
      })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error(`Failed to bulk create ${this.collection}:`, error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Bulk update items
   */
  async updateMany(ids: (number | string)[], data: Partial<T>): Promise<ListResponse<T>> {
    try {
      const res = await $api(`/items/${this.collection}`, {
        method: 'PATCH',
        body: { keys: ids, data },
      })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error(`Failed to bulk update ${this.collection}:`, error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Bulk delete items
   */
  async deleteMany(ids: (number | string)[]): Promise<ServiceResponse<void>> {
    try {
      await $api(`/items/${this.collection}`, {
        method: 'DELETE',
        body: ids,
      })
      return { data: undefined, success: true }
    }
    catch (error) {
      console.error(`Failed to bulk delete ${this.collection}:`, error)
      return { data: undefined, success: false, error: String(error) }
    }
  }
}
