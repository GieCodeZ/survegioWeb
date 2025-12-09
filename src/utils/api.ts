import { ofetch } from 'ofetch'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8061'

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

// Function to refresh the access token
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useCookie('refreshToken').value
  if (!refreshToken)
    return null

  try {
    const res = await ofetch('/auth/refresh', {
      baseURL,
      method: 'POST',
      body: { refresh_token: refreshToken },
    })

    const { access_token, refresh_token } = res.data

    // Get cookie options based on "Remember me" preference
    const rememberMe = useCookie('rememberMe').value === 'true'
    const cookieOptions = rememberMe
      ? { maxAge: 60 * 60 * 24 * 7 } // 7 days in seconds
      : { maxAge: 0 } // Session cookie

    // Update cookies with new tokens
    useCookie('accessToken', cookieOptions).value = access_token
    useCookie('refreshToken', cookieOptions).value = refresh_token

    return access_token
  }
  catch {
    // Refresh failed, clear all auth data
    useCookie('accessToken').value = null
    useCookie('refreshToken').value = null
    useCookie('userData').value = null
    useCookie('userAbilityRules').value = null
    useCookie('rememberMe').value = null

    return null
  }
}

// Handle token refresh with request queuing
async function handleTokenRefresh(): Promise<string | null> {
  if (isRefreshing) {
    // Wait for the ongoing refresh to complete
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = refreshAccessToken()

  try {
    const token = await refreshPromise

    return token
  }
  finally {
    isRefreshing = false
    refreshPromise = null
  }
}

export const $api = ofetch.create({
  baseURL,
  async onRequest({ options }) {
    const accessToken = useCookie('accessToken').value
    if (accessToken) {
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      }
    }
  },
  async onResponseError({ request, options, response }) {
    // If 401 Unauthorized, try to refresh the token
    if (response.status === 401) {
      const url = typeof request === 'string' ? request : request.toString()

      // Don't try to refresh for auth endpoints
      if (url.includes('/auth/'))
        throw response

      const newToken = await handleTokenRefresh()

      if (newToken) {
        // Retry the original request with new token
        return ofetch(request, {
          ...options,
          baseURL,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
        })
      }
      else {
        // Refresh failed, redirect to login
        window.location.href = '/login'
      }
    }

    throw response
  },
})

// Directus REST API helpers
export const directus = {
  // Get items from a collection
  items: <T = any>(collection: string) => ({
    async readMany(params?: Record<string, any>): Promise<T[]> {
      const res = await $api(`/items/${collection}`, { params })

      return res.data
    },
    async readOne(id: string | number, params?: Record<string, any>): Promise<T> {
      const res = await $api(`/items/${collection}/${id}`, { params })

      return res.data
    },
    async create(data: Partial<T>): Promise<T> {
      const res = await $api(`/items/${collection}`, {
        method: 'POST',
        body: data,
      })

      return res.data
    },
    async update(id: string | number, data: Partial<T>): Promise<T> {
      const res = await $api(`/items/${collection}/${id}`, {
        method: 'PATCH',
        body: data,
      })

      return res.data
    },
    async delete(id: string | number): Promise<void> {
      await $api(`/items/${collection}/${id}`, {
        method: 'DELETE',
      })
    },
  }),

  // Authentication
  auth: {
    async login(email: string, password: string) {
      const res = await $api('/auth/login', {
        method: 'POST',
        body: { email, password },
      })

      return res.data
    },
    async refresh(refreshToken: string) {
      const res = await $api('/auth/refresh', {
        method: 'POST',
        body: { refresh_token: refreshToken },
      })

      return res.data
    },
    async logout(refreshToken: string) {
      await $api('/auth/logout', {
        method: 'POST',
        body: { refresh_token: refreshToken },
      })
    },
    async me() {
      const res = await $api('/users/me')

      return res.data
    },
  },
}
