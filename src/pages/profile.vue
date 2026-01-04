<script setup lang="ts">
import { $api } from '@/utils/api'

// User data from cookie
const userData = useCookie<any>('userData')

// Account form data
const accountForm = ref({
  first_name: '',
  last_name: '',
  email: '',
})

// Password form data
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

// UI state
const isAccountLoading = ref(false)
const isPasswordLoading = ref(false)
const accountSuccess = ref(false)
const accountError = ref('')
const passwordSuccess = ref(false)
const passwordError = ref('')

// Password visibility toggles
const isCurrentPasswordVisible = ref(false)
const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)

// Validation rules
const requiredRule = (v: string) => !!v || 'This field is required'
const minLengthRule = (min: number) => (v: string) => (v && v.length >= min) || `Minimum ${min} characters required`
const emailRule = (v: string) => /.+@.+\..+/.test(v) || 'Please enter a valid email'
const passwordMatchRule = (v: string) => v === passwordForm.value.newPassword || 'Passwords do not match'

// Load user data on mount
onMounted(() => {
  if (userData.value) {
    accountForm.value = {
      first_name: userData.value.first_name || '',
      last_name: userData.value.last_name || '',
      email: userData.value.email || '',
    }
  }
})

// Validate account form
const isAccountFormValid = computed(() => {
  return (
    accountForm.value.first_name.length >= 2 &&
    accountForm.value.last_name.length >= 2 &&
    /.+@.+\..+/.test(accountForm.value.email)
  )
})

// Validate password form
const isPasswordFormValid = computed(() => {
  const { currentPassword, newPassword, confirmPassword } = passwordForm.value
  return (
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    newPassword === confirmPassword
  )
})

// Update account information
const updateAccount = async () => {
  if (!isAccountFormValid.value || !userData.value?.id) return

  isAccountLoading.value = true
  accountSuccess.value = false
  accountError.value = ''

  try {
    await $api(`/users/${userData.value.id}`, {
      method: 'PATCH',
      body: {
        first_name: accountForm.value.first_name,
        last_name: accountForm.value.last_name,
        email: accountForm.value.email,
      },
    })

    // Update the cookie with new data
    userData.value = {
      ...userData.value,
      first_name: accountForm.value.first_name,
      last_name: accountForm.value.last_name,
      email: accountForm.value.email,
    }

    accountSuccess.value = true
  }
  catch (error: any) {
    console.error('Failed to update account:', error)
    accountError.value = error?.data?.errors?.[0]?.message || 'Failed to update account information'
  }
  finally {
    isAccountLoading.value = false
  }
}

// Reset account form
const resetAccountForm = () => {
  if (userData.value) {
    accountForm.value = {
      first_name: userData.value.first_name || '',
      last_name: userData.value.last_name || '',
      email: userData.value.email || '',
    }
  }
  accountSuccess.value = false
  accountError.value = ''
}

// Change password
const changePassword = async () => {
  if (!isPasswordFormValid.value || !userData.value?.id) return

  isPasswordLoading.value = true
  passwordSuccess.value = false
  passwordError.value = ''

  try {
    // First verify current password by attempting login
    await $api('/auth/login', {
      method: 'POST',
      body: {
        email: userData.value.email,
        password: passwordForm.value.currentPassword,
      },
    })

    // If login succeeds, update the password
    await $api(`/users/${userData.value.id}`, {
      method: 'PATCH',
      body: {
        password: passwordForm.value.newPassword,
      },
    })

    passwordSuccess.value = true
    resetPasswordForm()
  }
  catch (error: any) {
    console.error('Failed to change password:', error)
    if (error?.status === 401 || error?.data?.errors?.[0]?.message?.toLowerCase().includes('invalid')) {
      passwordError.value = 'Current password is incorrect'
    }
    else {
      passwordError.value = error?.data?.errors?.[0]?.message || 'Failed to change password'
    }
  }
  finally {
    isPasswordLoading.value = false
  }
}

// Reset password form
const resetPasswordForm = () => {
  passwordForm.value = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  }
  isCurrentPasswordVisible.value = false
  isNewPasswordVisible.value = false
  isConfirmPasswordVisible.value = false
}

// Page metadata
definePage({
  meta: {
    subject: 'Profile',
    action: 'read',
  },
})
</script>

<template>
  <VRow>
    <!-- Account Information Card -->
    <VCol cols="12">
      <VCard>
        <VCardItem class="pb-6">
          <VCardTitle>Account Information</VCardTitle>
          <VCardSubtitle>Update your personal information</VCardSubtitle>
        </VCardItem>

        <VCardText>
          <!-- Success Alert -->
          <VAlert
            v-if="accountSuccess"
            type="success"
            variant="tonal"
            closable
            class="mb-4"
            @click:close="accountSuccess = false"
          >
            Account information updated successfully
          </VAlert>

          <!-- Error Alert -->
          <VAlert
            v-if="accountError"
            type="error"
            variant="tonal"
            closable
            class="mb-4"
            @click:close="accountError = ''"
          >
            {{ accountError }}
          </VAlert>

          <VForm @submit.prevent="updateAccount">
            <VRow>
              <!-- First Name -->
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="accountForm.first_name"
                  label="First Name"
                  placeholder="Enter your first name"
                  :rules="[requiredRule, minLengthRule(2)]"
                />
              </VCol>

              <!-- Last Name -->
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="accountForm.last_name"
                  label="Last Name"
                  placeholder="Enter your last name"
                  :rules="[requiredRule, minLengthRule(2)]"
                />
              </VCol>

              <!-- Email -->
              <VCol cols="12">
                <VTextField
                  v-model="accountForm.email"
                  label="Email"
                  placeholder="Enter your email"
                  type="email"
                  :rules="[requiredRule, emailRule]"
                />
              </VCol>

              <!-- Action Buttons -->
              <VCol
                cols="12"
                class="d-flex flex-wrap gap-4"
              >
                <VBtn
                  type="submit"
                  :loading="isAccountLoading"
                  :disabled="!isAccountFormValid"
                >
                  Save Changes
                </VBtn>

                <VBtn
                  color="secondary"
                  variant="outlined"
                  @click="resetAccountForm"
                >
                  Reset
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Change Password Card -->
    <VCol cols="12">
      <VCard>
        <VCardItem class="pb-6">
          <VCardTitle>Change Password</VCardTitle>
          <VCardSubtitle>Update your password</VCardSubtitle>
        </VCardItem>

        <VCardText>
          <!-- Success Alert -->
          <VAlert
            v-if="passwordSuccess"
            type="success"
            variant="tonal"
            closable
            class="mb-4"
            @click:close="passwordSuccess = false"
          >
            Password changed successfully
          </VAlert>

          <!-- Error Alert -->
          <VAlert
            v-if="passwordError"
            type="error"
            variant="tonal"
            closable
            class="mb-4"
            @click:close="passwordError = ''"
          >
            {{ passwordError }}
          </VAlert>

          <VForm @submit.prevent="changePassword">
            <VRow>
              <!-- Current Password -->
              <VCol cols="12">
                <VTextField
                  v-model="passwordForm.currentPassword"
                  :type="isCurrentPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="isCurrentPasswordVisible ? 'ri-eye-off-line' : 'ri-eye-line'"
                  label="Current Password"
                  placeholder="Enter your current password"
                  :rules="[requiredRule]"
                  @click:append-inner="isCurrentPasswordVisible = !isCurrentPasswordVisible"
                />
              </VCol>

              <!-- New Password -->
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="passwordForm.newPassword"
                  :type="isNewPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="isNewPasswordVisible ? 'ri-eye-off-line' : 'ri-eye-line'"
                  label="New Password"
                  placeholder="Enter your new password"
                  :rules="[requiredRule]"
                  @click:append-inner="isNewPasswordVisible = !isNewPasswordVisible"
                />
              </VCol>

              <!-- Confirm Password -->
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="passwordForm.confirmPassword"
                  :type="isConfirmPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="isConfirmPasswordVisible ? 'ri-eye-off-line' : 'ri-eye-line'"
                  label="Confirm New Password"
                  placeholder="Confirm your new password"
                  :rules="[requiredRule, passwordMatchRule]"
                  @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                />
              </VCol>
            </VRow>

            <!-- Action Buttons -->
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                type="submit"
                :loading="isPasswordLoading"
                :disabled="!isPasswordFormValid"
              >
                Change Password
              </VBtn>

              <VBtn
                color="secondary"
                variant="outlined"
                @click="resetPasswordForm"
              >
                Reset
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
