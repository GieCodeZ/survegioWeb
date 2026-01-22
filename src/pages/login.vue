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

const isSnackbarVisible = ref(false)
const snackbarColor = ref('error') // 'error' for red, 'success' for green

const isLoading = ref(false)

// Check if redirected due to session expiration
const sessionExpired = computed(() => route.query.sessionExpired === 'true')

// Dismiss the session expired alert
const dismissSessionAlert = () => {
  router.replace({ query: { ...route.query, sessionExpired: undefined } })
}

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
    let redirectPath = '/dashboard'

    if (roleName === 'administrator') {
      userAbilityRules = [
        { action: 'manage', subject: 'all' },
      ]
      redirectPath = '/dashboard'
    }
    else if (roleName === 'dean') {
      userAbilityRules = [
        { action: 'read', subject: 'Auth' },
        { action: 'read', subject: 'Profile' },
        { action: 'read', subject: 'DeanDashboard' },
        { action: 'read', subject: 'DeanSurveys' },
        { action: 'create', subject: 'DeanSurveys' },
        { action: 'read', subject: 'DeanEvaluations' },
        { action: 'read', subject: 'DeanTeachers' },
        { action: 'read', subject: 'DeanStudents' },
        { action: 'read', subject: 'DeanClasses' },
      ]
      redirectPath = '/dean/dashboard'

      // Fetch the dean's teacher record to get dean_id
      try {
        console.log('Looking for teacher with user_id:', userData.id, 'or email:', userData.email)

        // First try to find by user_id (direct link to Directus user)
        let teacherRes = await ofetch('/items/Teachers', {
          baseURL,
          params: {
            filter: { user_id: { _eq: userData.id } },
            fields: ['id', 'first_name', 'last_name', 'position', 'Department', 'email', 'user_id'],
            limit: 1,
          },
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        })
        console.log('Teacher lookup by user_id result:', teacherRes.data)

        // If not found by user_id, try by email as fallback
        if (!teacherRes.data?.[0]) {
          console.log('No teacher found by user_id, trying email...')
          teacherRes = await ofetch('/items/Teachers', {
            baseURL,
            params: {
              filter: { email: { _eq: userData.email } },
              fields: ['id', 'first_name', 'last_name', 'position', 'Department', 'email', 'user_id'],
              limit: 1,
            },
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          })
          console.log('Teacher lookup by email result:', teacherRes.data)
        }

        // If still not found, try to link by matching first_name + last_name
        if (!teacherRes.data?.[0] && userData.first_name && userData.last_name) {
          console.log('No teacher found by email, trying name match...')
          teacherRes = await ofetch('/items/Teachers', {
            baseURL,
            params: {
              filter: {
                _and: [
                  { first_name: { _eq: userData.first_name } },
                  { last_name: { _eq: userData.last_name } },
                  { position: { _eq: 'Dean' } },
                ],
              },
              fields: ['id', 'first_name', 'last_name', 'position', 'Department', 'email', 'user_id'],
              limit: 1,
            },
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          })
          console.log('Teacher lookup by name result:', teacherRes.data)

          // If found by name, update the teacher record with user_id for future logins
          if (teacherRes.data?.[0] && !teacherRes.data[0].user_id) {
            console.log('Linking teacher to user_id:', userData.id)
            await ofetch(`/items/Teachers/${teacherRes.data[0].id}`, {
              baseURL,
              method: 'PATCH',
              body: { user_id: userData.id },
              headers: {
                Authorization: `Bearer ${access_token}`,
              },
            })
          }
        }

        if (teacherRes.data?.[0]) {
          userData.dean_id = teacherRes.data[0].id
          userData.department_id = teacherRes.data[0].Department
          console.log('Set dean_id:', userData.dean_id, 'department_id:', userData.department_id)
        }
        else {
          console.warn('No teacher found with user_id:', userData.id, 'email:', userData.email, 'or name:', userData.first_name, userData.last_name)
        }
      }
      catch (err) {
        console.error('Failed to fetch teacher record:', err)
      }
    }
    else if (roleName === 'student') {
      userAbilityRules = [
        { action: 'read', subject: 'Auth' },
        { action: 'read', subject: 'Profile' },
        { action: 'read', subject: 'StudentDashboard' },
        { action: 'read', subject: 'StudentSurveys' },
        { action: 'create', subject: 'StudentSurveys' },
      ]
      redirectPath = '/student/dashboard'

      // Fetch the student record to get student_id
      try {
        console.log('Looking for student with user_id:', userData.id, 'or email:', userData.email)

        // First try to find by user_id (direct link to Directus user)
        let studentRes = await ofetch('/items/students', {
          baseURL,
          params: {
            filter: { user_id: { _eq: userData.id } },
            fields: ['id', 'first_name', 'last_name', 'deparment_id', 'email', 'student_number', 'user_id'],
            limit: 1,
          },
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        })
        console.log('Student lookup by user_id result:', studentRes.data)

        // If not found by user_id, try by email
        if (!studentRes.data?.[0]) {
          console.log('No student found by user_id, trying email...')
          studentRes = await ofetch('/items/students', {
            baseURL,
            params: {
              filter: { email: { _eq: userData.email } },
              fields: ['id', 'first_name', 'last_name', 'deparment_id', 'email', 'student_number', 'user_id'],
              limit: 1,
            },
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          })
          console.log('Student lookup by email result:', studentRes.data)
        }

        // If not found by email, try by name matching
        if (!studentRes.data?.[0] && userData.first_name && userData.last_name) {
          console.log('No student found by email, trying name match...')
          studentRes = await ofetch('/items/students', {
            baseURL,
            params: {
              filter: {
                _and: [
                  { first_name: { _eq: userData.first_name } },
                  { last_name: { _eq: userData.last_name } },
                ],
              },
              fields: ['id', 'first_name', 'last_name', 'deparment_id', 'email', 'student_number', 'user_id'],
              limit: 1,
            },
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          })
          console.log('Student lookup by name result:', studentRes.data)

          // If found by name, update the student record with user_id for future logins
          if (studentRes.data?.[0] && !studentRes.data[0].user_id) {
            console.log('Linking student to user_id:', userData.id)
            try {
              await ofetch(`/items/students/${studentRes.data[0].id}`, {
                baseURL,
                method: 'PATCH',
                body: { user_id: userData.id },
                headers: {
                  Authorization: `Bearer ${access_token}`,
                },
              })
            }
            catch (linkErr) {
              console.warn('Could not link student to user_id:', linkErr)
            }
          }
        }

        if (studentRes.data?.[0]) {
          userData.student_id = studentRes.data[0].id
          console.log('Set student_id:', userData.student_id)
        }
        else {
          console.warn('No student found with user_id:', userData.id, 'email:', userData.email, 'or name:', userData.first_name, userData.last_name)
        }
      }
      catch (err) {
        console.error('Failed to fetch student record:', err)
      }
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

    // Redirect based on role
    await nextTick(() => {
      router.replace(route.query.to ? String(route.query.to) : redirectPath)
    })
  }
  catch (err: any) {
  console.error("Login Error:", err)
  snackbarColor.value = 'error'
  isSnackbarVisible.value = true

  // Optional: Clear only the password so the user can try again immediately
  credentials.value.password = ''
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

          <!-- Session Expired Alert -->
          <VAlert
            v-if="sessionExpired"
            type="warning"
            variant="tonal"
            closable
            class="mb-4"
            @click:close="dismissSessionAlert"
          >
            <template #title>
              Session Expired
            </template>
            Your session has expired. Please log in again to continue.
          </VAlert>

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
                    @update:model-value="errors.email = undefined"
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
                    @update:model-value="errors.password = undefined"
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
              </VRow>
            </VForm>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
    <VSnackbar
      v-model="isSnackbarVisible"
      color="error"
      location="top end"
      timeout="4000"
    >
      <div class="text-justify w-100">
        Login Failed. Invalid user credentials
      </div>
    </VSnackbar>
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
