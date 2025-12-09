<script setup lang="ts">
import { VNodeRenderer } from '@layouts/components/VNodeRenderer'
import { themeConfig } from '@themeConfig'
import { VForm } from 'vuetify/components/VForm'

definePage({
  meta: {
    layout: 'blank',
    unauthenticatedOnly: true,
  },
})

const isPasswordVisible = ref(false)

const route = useRoute()
const router = useRouter()

const ability = useAbility()

const errors = ref<Record<string, string | undefined>>({
  email: undefined,
  password: undefined,
})

const refVForm = ref<VForm>()

// Load saved email from localStorage if "Remember me" was checked
const savedEmail = localStorage.getItem('rememberedEmail')

const credentials = ref({
  email: savedEmail || '',
  password: '',
})

const rememberMe = ref(!!savedEmail)

const isLoading = ref(false)

const login = async () => {
  isLoading.value = true
  errors.value = { email: undefined, password: undefined }

  try {
    // Authenticate with Directus (using ofetch directly to avoid sending old tokens)
    const { ofetch } = await import('ofetch')
    const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8061'

    const authRes = await ofetch('/auth/login', {
      baseURL,
      method: 'POST',
      body: {
        email: credentials.value.email,
        password: credentials.value.password,
      },
    })

    const { access_token, refresh_token } = authRes.data

    // Cookie options based on "Remember me"
    // If remember me: 7 days, otherwise: session cookie (expires when browser closes)
    const cookieOptions = rememberMe.value
      ? { maxAge: 60 * 60 * 24 * 7 } // 7 days in seconds
      : { maxAge: 0 } // Session cookie

    // Store remember me preference for token refresh
    useCookie('rememberMe').value = rememberMe.value ? 'true' : 'false'

    // Save or remove email for autofill
    if (rememberMe.value)
      localStorage.setItem('rememberedEmail', credentials.value.email)
    else
      localStorage.removeItem('rememberedEmail')

    // Store tokens
    useCookie('accessToken', cookieOptions).value = access_token
    useCookie('refreshToken', cookieOptions).value = refresh_token

    // Get user data from Directus (pass token directly to avoid timing issues)
    const userRes = await ofetch('/users/me', {
      baseURL,
      params: {
        fields: ['id', 'email', 'first_name', 'last_name', 'avatar', 'role.id', 'role.name'],
      },
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    const userData = userRes.data

    // Define ability rules based on role
    const roleName = userData.role?.name?.toLowerCase() || ''
    let userAbilityRules: { action: string; subject: string }[] = []

    if (roleName === 'administrator') {
      userAbilityRules = [
        { action: 'manage', subject: 'all' },
      ]
    }
    else {
      // Default permissions for other roles
      userAbilityRules = [
        { action: 'read', subject: 'Auth' },
        { action: 'read', subject: 'Dashboard' },
      ]
    }

    // Store user data and ability rules
    useCookie('userData', cookieOptions).value = userData
    useCookie('userAbilityRules', cookieOptions).value = userAbilityRules
    ability.update(userAbilityRules)

    // Redirect to dashboard
    await nextTick(() => {
      router.replace(route.query.to ? String(route.query.to) : '/dashboard')
    })
  }
  catch (err: any) {
    console.error(err)

    // Handle Directus error responses
    if (err.data?.errors) {
      const directusError = err.data.errors[0]

      if (directusError.extensions?.code === 'INVALID_CREDENTIALS') {
        errors.value.email = 'Invalid email or password'
      }
      else {
        errors.value.email = directusError.message || 'Login failed'
      }
    }
    else {
      errors.value.email = 'An error occurred. Please try again.'
    }
  }
  finally {
    isLoading.value = false
  }
}

const onSubmit = () => {
  refVForm.value?.validate()
    .then(({ valid: isValid }) => {
      if (isValid)
        login()
    })
}
</script>

<template>
  <div class="login-page">
    <VRow no-gutters class="auth-wrapper">
      <!-- Left Side - Yellow Background -->
      <VCol
        md="7"
        class="d-none d-md-flex"
      >
        <div class="left-section d-flex flex-column justify-center align-center w-100 h-100 pa-8">
          <div class="logo-large d-flex justify-center mb-6">
            <VNodeRenderer :nodes="themeConfig.app.logo" />
          </div>
          <h1 class="text-h2 font-weight-bold text-primary mb-4 text-center">Welcome to Survegio</h1>
          <p class="text-h6 text-primary text-center" style="opacity: 0.8; max-width: 400px;">
            Your trusted evaluation system — fast, secure, and easy to use.
          </p>
        </div>
      </VCol>

      <!-- Right Side - Login Form -->
      <VCol
        cols="12"
        md="5"
        class="d-flex align-center justify-center"
        style="background-color: rgb(var(--v-theme-surface));"
      >
        <VCard
          flat
          :max-width="450"
          class="pa-6 pa-sm-8 w-100"
        >
          <!-- Mobile Logo -->
          <div class="d-flex d-md-none align-center justify-center gap-x-3 mb-6">
            <VNodeRenderer :nodes="themeConfig.app.logo" />
            <div class="d-flex flex-column">
              <span class="text-h5 font-weight-bold text-primary">{{ themeConfig.app.title }}</span>
              <span class="text-caption text-medium-emphasis">Performance Evaluation</span>
            </div>
          </div>

          <VCardText class="pa-0">
            <h4 class="text-h4 mb-1 text-primary">
              Login
            </h4>
            <p class="text-body-1 text-medium-emphasis mb-6">
              Enter your credentials to proceed.
            </p>
          </VCardText>

          <VCardText class="pa-0">
            <VForm
              ref="refVForm"
              @submit.prevent="onSubmit"
            >
              <VRow>
                <!-- email -->
                <VCol cols="12">
                  <VTextField
                    v-model="credentials.email"
                    label="Email"
                    placeholder="Enter your email"
                    type="email"
                    autofocus
                    :rules="[requiredValidator, emailValidator]"
                    :error-messages="errors.email"
                    variant="outlined"
                  />
                </VCol>

                <!-- password -->
                <VCol cols="12">
                  <VTextField
                    v-model="credentials.password"
                    label="Password"
                    placeholder="Enter your password"
                    :rules="[requiredValidator]"
                    :type="isPasswordVisible ? 'text' : 'password'"
                    :error-messages="errors.password"
                    :append-inner-icon="isPasswordVisible ? 'ri-eye-off-line' : 'ri-eye-line'"
                    variant="outlined"
                    @click:append-inner="isPasswordVisible = !isPasswordVisible"
                  />

                  <div class="d-flex align-center flex-wrap justify-space-between mt-2 mb-4">
                    <VCheckbox
                      v-model="rememberMe"
                      label="Remember me"
                      density="compact"
                    />
                    <RouterLink
                      class="text-primary text-body-2"
                      :to="{ name: 'forgot-password' }"
                    >
                      Forgot Password?
                    </RouterLink>
                  </div>

                  <VBtn
                    block
                    type="submit"
                    color="primary"
                    size="large"
                    :loading="isLoading"
                    :disabled="isLoading"
                  >
                    Login
                  </VBtn>
                </VCol>

                <!-- back to home -->
                <VCol
                  cols="12"
                  class="text-center"
                >
                  <RouterLink
                    class="text-primary text-body-2"
                    :to="{ name: 'landing' }"
                  >
                    <VIcon icon="ri-arrow-left-line" size="16" class="me-1" />
                    Back to Home
                  </RouterLink>
                </VCol>
              </VRow>
            </VForm>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </div>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
}

.auth-wrapper {
  min-height: 100vh;
}

.left-section {
  background-color: rgb(var(--v-theme-secondary));
}

.logo-large {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  :deep(.app-logo) {
    width: 150px !important;
    height: 150px !important;
    display: flex;
    justify-content: center;
    align-items: center;

    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  }
}
</style>
